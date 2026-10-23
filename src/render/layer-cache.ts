/**
 * Caché de la capa estática (M2-17), ahora una por capa (M5-17).
 *
 * La idea: las piezas que no cambian con el ratón —cables, uniones y símbolos— se dibujan
 * **una vez** a un lienzo aparte, en píxeles ya resueltos, y a partir de ahí un fotograma
 * cualquiera solo tiene que **pegar** ese lienzo. Los pines y el cable provisional (la capa
 * de encima) se siguen dibujando del natural, porque cambian a cada movimiento.
 *
 * `LayerCacheSet` mantiene un `StaticLayerCache` por capa. Ocultar o mostrar una capa solo
 * afecta a su propia caché: las demás siguen pegándose tal cual. Al cambiar el z-order ni
 * siquiera se rehace nada; solo cambia el orden de los pegados.
 *
 * Lo que esto arregla de verdad es el **paneo**: mover la vista es cambiar dos números, y
 * con la caché no se vuelve a recorrer ni una sola pieza. El zoom sí rehace la caché, porque
 * cambia la escala a la que está dibujada.
 *
 * La caché se guarda en **coordenadas del mundo**, no de la pantalla, y por eso el paneo la
 * reutiliza tal cual. Cuando el circuito es demasiado grande para caber en un lienzo
 * razonable, la caché se aparta y se vuelve a dibujar del natural (con recorte de vista,
 * que para eso está M2-16).
 */

import type { Id } from '../core/model/types'
import type { CameraState } from './camera'
import { itemBox } from './culling'
import { drawDevice, drawJunction, drawWire } from './draw'
import { GRID_SIZE } from './geometry'
import type { DrawItem, RenderTheme } from './ir-renderer'

/** Lado máximo del lienzo de la caché, en píxeles de dispositivo. */
const MAX_SIDE = 4096

/** La firma de un conjunto de piezas: con esto se sabe si la caché sigue valiendo. */
interface Signature {
  readonly key: string
  /** Esquina superior izquierda del contenido, en unidades de rejilla. */
  readonly minX: number
  readonly minY: number
  /** Escala mundo → píxel de dispositivo. */
  readonly scale: number
  readonly width: number
  readonly height: number
}

/** Mezcla un entero en un hash acumulado (FNV-1a con `Math.imul`). */
function mix(hash: number, value: number): number {
  return Math.imul(hash ^ (value | 0), 16777619) >>> 0
}

const ROTATION_CODE: Record<string, number> = { up: 0, right: 1, down: 2, left: 3 }
const STATE_CODE: Record<string, number> = { off: 0, zero: 1, one: 2 }

/** Todo lo que distingue a una pieza, para saber si cambió. */
function mixItem(hash: number, item: DrawItem): number {
  let result = mix(hash, item.kind.length)
  switch (item.kind) {
    case 'device':
      result = mix(result, item.position.x)
      result = mix(result, item.position.y)
      result = mix(result, item.width)
      result = mix(result, item.height)
      result = mix(result, ROTATION_CODE[item.rotation] ?? 0)
      result = mix(result, STATE_CODE[item.state] ?? 0)
      result = mix(result, item.selected ? 1 : 0)
      result = mix(result, item.hovered === true ? 1 : 0)
      result = mix(result, Math.round(((item as { layerOpacity?: number }).layerOpacity ?? 1) * 1000))
      for (const character of item.shape) {
        result = mix(result, character.charCodeAt(0))
      }
      return result
    case 'wire':
      result = mix(result, item.p1.x)
      result = mix(result, item.p1.y)
      result = mix(result, item.p2.x)
      result = mix(result, item.p2.y)
      result = mix(result, item.selected ? 1 : 0)
      result = mix(result, item.hovered === true ? 1 : 0)
      result = mix(result, Math.round(((item as { layerOpacity?: number }).layerOpacity ?? 1) * 1000))
      result = mix(result, item.overlay === true ? 1 : 0)
      result = mix(result, item.bus ? 1 : 0)
      result = mix(result, item.signal === 'high' ? 3 : item.signal === 'low' ? 2 : item.signal === 'floating' ? 1 : 0)
      if (item.color !== undefined) {
        for (const character of item.color) {
          result = mix(result, character.charCodeAt(0))
        }
      }
      return result
    case 'junction':
      result = mix(result, item.point.x)
      return mix(result, item.point.y)
    case 'pinDot':
      result = mix(result, item.point.x)
      return mix(result, item.point.y)
    case 'label':
      result = mix(result, item.position.x)
      result = mix(result, item.position.y)
      result = mix(result, item.selected === true ? 1 : 0)
      for (const character of item.text) {
        result = mix(result, character.charCodeAt(0))
      }
      return result
  }
}

/** La parte del tema que cambia colores: si cambia, la caché ya no vale. */
function themeKey(theme: RenderTheme): string {
  return [
    theme.background,
    theme.gridDot,
    theme.gridDotStrong,
    theme.wireIdle,
    theme.wireHigh,
    theme.wireLow,
    theme.wireFloating,
    theme.wireBus,
    theme.wireSelected,
    theme.symbolFill,
    theme.symbolStroke,
    theme.gateText,
    theme.gateError,
    theme.selection,
    theme.hover,
    theme.pinDot,
    theme.handle,
    theme.stateOff,
    theme.stateZero,
    theme.stateOne,
  ].join('|')
}

export class StaticLayerCache {
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null
  private key = ''

  /** Tira la caché. El siguiente pintado la rehará. */
  clear(): void {
    this.canvas = null
    this.key = ''
  }

  /**
   * Pinta las piezas de la capa de abajo, tirando de caché si se puede.
   *
   * `cssWidth`/`cssHeight` son el tamaño visible del lienzo en píxeles CSS: se usan para
   * pegar **solo lo que se ve**, en vez de componer la caché entera cada fotograma.
   *
   * Devuelve `true` si se ha encargado de pintarlas; `false` si no ha podido (circuito
   * demasiado grande, o entorno sin `drawImage`) y quien llama tiene que dibujarlas del
   * natural.
   */
  paint(
    ctx: CanvasRenderingContext2D,
    items: readonly DrawItem[],
    camera: CameraState,
    dpr: number,
    theme: RenderTheme,
    cssWidth: number,
    cssHeight: number,
  ): boolean {
    // En entornos de mentira (los tests) el contexto no sabe pegar imágenes. Se aparta.
    if (typeof ctx.drawImage !== 'function') {
      return false
    }
    if (items.length === 0) {
      this.canvas = null
      this.key = ''
      return true
    }

    const signature = this.signature(items, camera, dpr, theme)
    if (signature === null) {
      return false
    }

    if (signature.key !== this.key || this.canvas === null) {
      const built = this.rebuild(items, signature, theme)
      if (built === null) {
        return false
      }
      this.canvas = built
      this.key = signature.key
    }

    // El pegado se hace en píxeles de dispositivo (transformación identidad) y **solo de la
    // parte visible**: la caché ya está a la escala correcta, así que no hay remuestreo y
    // sale nítido; y lo que queda fuera del lienzo ni se compone.
    const zoom = camera.zoom
    const originX = Math.round((camera.offsetX + signature.minX * GRID_SIZE * zoom) * dpr)
    const originY = Math.round((camera.offsetY + signature.minY * GRID_SIZE * zoom) * dpr)
    const deviceWidth = Math.round(cssWidth * dpr)
    const deviceHeight = Math.round(cssHeight * dpr)

    const sx = Math.max(0, -originX)
    const sy = Math.max(0, -originY)
    const sw = Math.min(signature.width, deviceWidth - originX) - sx
    const sh = Math.min(signature.height, deviceHeight - originY) - sy
    if (sw <= 0 || sh <= 0) {
      // La caché está entera fuera de la pantalla: no hay nada que pegar.
      return true
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(
      this.canvas as CanvasImageSource,
      sx,
      sy,
      sw,
      sh,
      originX + sx,
      originY + sy,
      sw,
      sh,
    )
    return true
  }

  /** La firma de una lista de piezas, o `null` si no cabe en un lienzo razonable. */
  private signature(
    items: readonly DrawItem[],
    camera: CameraState,
    dpr: number,
    theme: RenderTheme,
  ): Signature | null {
    const scale = GRID_SIZE * camera.zoom * dpr
    if (!(scale > 0)) {
      return null
    }

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    let hash = 2166136261

    for (const item of items) {
      hash = mixItem(hash, item)
      const box = itemBox(item)
      if (box !== null) {
        if (box.x0 < minX) minX = box.x0
        if (box.y0 < minY) minY = box.y0
        if (box.x1 > maxX) maxX = box.x1
        if (box.y1 > maxY) maxY = box.y1
      }
    }

    if (minX === Number.POSITIVE_INFINITY) {
      return null
    }

    // Un pelo de margen por lado: el trazo y los halos se salen de la caja del símbolo.
    const width = Math.ceil((maxX - minX) * scale) + 4
    const height = Math.ceil((maxY - minY) * scale) + 4
    if (width <= 0 || height <= 0 || width > MAX_SIDE || height > MAX_SIDE) {
      return null
    }

    const key = `${hash}|${camera.zoom}|${dpr}|${themeKey(theme)}|${width}x${height}`
    return { key, minX, minY, scale, width, height }
  }

  /** Dibuja todas las piezas a un lienzo nuevo. Devuelve `null` si no se puede. */
  private rebuild(
    items: readonly DrawItem[],
    signature: Signature,
    theme: RenderTheme,
  ): HTMLCanvasElement | OffscreenCanvas | null {
    const canvas = this.createCanvas(signature.width, signature.height)
    if (canvas === null) {
      return null
    }
    const ctx = this.context(canvas)
    if (ctx === null) {
      return null
    }

    ctx.setTransform(
      signature.scale,
      0,
      0,
      signature.scale,
      -signature.minX * signature.scale,
      -signature.minY * signature.scale,
    )
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    for (const item of items) {
      const alpha = 'layerOpacity' in item ? (item.layerOpacity ?? 1) : 1
      ctx.save()
      ctx.globalAlpha = alpha
      switch (item.kind) {
        case 'junction':
          drawJunction(ctx, item, theme)
          break
        case 'wire':
          drawWire(ctx, item, theme)
          break
        case 'device':
          drawDevice(ctx, item, theme)
          break
      }
      ctx.restore()
    }
    return canvas
  }

  private createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas | null {
    try {
      if (typeof OffscreenCanvas === 'function') {
        return new OffscreenCanvas(width, height)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      return canvas
    } catch {
      return null
    }
  }

  private context(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D | null {
    return canvas.getContext('2d') as CanvasRenderingContext2D | null
  }
}

/**
 * Un `StaticLayerCache` por capa.
 *
 * `retain` conserva las capas visibles y, opcionalmente, la última capa oculta. Ese hueco
 * hace que ocultar y volver a mostrar sea instantáneo, pero no deja crecer la memoria sin
 * límite: si el usuario oculta muchas capas, solo sobrevive la última que se pintó.
 */
export class LayerCacheSet {
  private readonly caches = new Map<Id, StaticLayerCache>()

  paint(
    ctx: CanvasRenderingContext2D,
    layerId: Id,
    items: readonly DrawItem[],
    camera: CameraState,
    dpr: number,
    theme: RenderTheme,
    cssWidth: number,
    cssHeight: number,
  ): boolean {
    let cache = this.caches.get(layerId)
    if (cache === undefined) {
      cache = new StaticLayerCache()
    } else {
      // Mover al final del Map convierte su orden de inserción en un LRU: `retain` puede
      // quedarse con las capas ocultas usadas más recientemente.
      this.caches.delete(layerId)
    }
    this.caches.set(layerId, cache)
    return cache.paint(ctx, items, camera, dpr, theme, cssWidth, cssHeight)
  }

  /**
   * Deja las capas visibles y hasta `idleLimit` capas ocultas (la última usada primero).
   *
   * El renderizador pasa 1: ocultar/mostrar alterna sin rehacer el lienzo de la capa que
   * vuelve. Con 0 se libera también esa caché, útil para pruebas o para un circuito nuevo.
   */
  retain(layerIds: ReadonlySet<Id>, idleLimit = 0): void {
    const idle: Id[] = []
    for (const id of this.caches.keys()) {
      if (!layerIds.has(id)) {
        idle.push(id)
      }
    }

    const limit = Math.max(0, Math.floor(idleLimit))
    for (let index = 0; index < idle.length - limit; index += 1) {
      const id = idle[index]
      if (id !== undefined) {
        this.caches.delete(id)
      }
    }
  }

  clear(): void {
    this.caches.clear()
  }

  /** Cuántas capas tienen caché ahora mismo. Útil para tests y para el panel de rendimiento. */
  get size(): number {
    return this.caches.size
  }
}
