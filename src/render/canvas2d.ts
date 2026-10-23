import { cullItems } from './culling'
import { drawDevice, drawJunction, drawLabel, drawPinDot, drawWire } from './draw'
import { GRID_SIZE } from './geometry'
import { drawGrid } from './grid'
import { StaticLayerCache } from './layer-cache'
import {
  isOverlayItem,
  type DrawItem,
  type IRenderer,
  type RenderScene,
  type RendererOptions,
  type RendererStats,
  type RenderTheme,
} from './ir-renderer'

/** Cada cuánto se informan las medidas, en milisegundos. */
const STATS_INTERVAL_MS = 500

/**
 * Renderizador sobre Canvas 2D (M1-03 y M1-04).
 *
 * - Un **único** `requestAnimationFrame` para toda la aplicación.
 * - Si nada ha cambiado, **no repinta** (bandera `dirty`) — técnica nº 9 del plan de
 *   rendimiento.
 * - Ajusta el búfer a `devicePixelRatio` para que se vea nítido en pantallas HiDPI.
 */
export class Canvas2DRenderer implements IRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private observer: ResizeObserver | null = null

  private cssWidth = 1
  private cssHeight = 1
  private dpr = 1

  private scene: RenderScene | null = null
  private dirty = true
  private rafId = 0

  /** La capa estática cacheada (M2-17). */
  private readonly layerCache = new StaticLayerCache()

  private onStats: ((stats: RendererStats) => void) | undefined

  private rafCount = 0
  private paintCount = 0
  private statsStart = 0
  private lastPaintMs = 0

  init(canvas: HTMLCanvasElement, options: RendererOptions = {}): void {
    this.destroy()

    const ctx = canvas.getContext('2d', { alpha: false })
    if (ctx === null) {
      throw new Error('No se ha podido obtener el contexto 2D del lienzo')
    }

    this.canvas = canvas
    this.ctx = ctx
    this.onStats = options.onStats

    // El tamaño lo manda el contenedor: nos avisan cuando cambie.
    this.observer = new ResizeObserver(() => {
      this.measure()
    })
    this.observer.observe(canvas)

    this.measure()
    this.statsStart = performance.now()
    this.rafId = requestAnimationFrame(this.tick)
  }

  resize(cssWidth: number, cssHeight: number): void {
    const canvas = this.canvas
    if (canvas === null) {
      return
    }

    this.dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
    this.cssWidth = Math.max(1, cssWidth)
    this.cssHeight = Math.max(1, cssHeight)

    const bufferWidth = Math.max(1, Math.round(this.cssWidth * this.dpr))
    const bufferHeight = Math.max(1, Math.round(this.cssHeight * this.dpr))
    if (canvas.width !== bufferWidth) {
      canvas.width = bufferWidth
    }
    if (canvas.height !== bufferHeight) {
      canvas.height = bufferHeight
    }
    this.dirty = true
  }

  render(scene: RenderScene): void {
    this.scene = scene
    this.dirty = true
  }

  destroy(): void {
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.observer?.disconnect()
    this.observer = null
    this.canvas = null
    this.ctx = null
    this.scene = null
    this.layerCache.clear()
    this.onStats = undefined
    this.dirty = true
  }

  /** Reajusta el búfer al tamaño real del lienzo en CSS. */
  private measure(): void {
    const canvas = this.canvas
    if (canvas === null) {
      return
    }
    this.resize(canvas.clientWidth, canvas.clientHeight)
  }

  /** El bucle. Es una propiedad flecha para no perder `this` al pasarlo a `requestAnimationFrame`. */
  private readonly tick = (now: number): void => {
    this.rafId = requestAnimationFrame(this.tick)
    this.rafCount++

    if (this.dirty) {
      const started = performance.now()
      this.paint()
      this.lastPaintMs = performance.now() - started
      this.paintCount++
      this.dirty = false
    }

    const elapsed = now - this.statsStart
    if (elapsed >= STATS_INTERVAL_MS) {
      const seconds = elapsed / 1000
      this.onStats?.({
        fps: this.rafCount / seconds,
        paintMs: this.lastPaintMs,
        paints: this.paintCount / seconds,
      })
      this.rafCount = 0
      this.paintCount = 0
      this.statsStart = now
    }
  }

  private paint(): void {
    const ctx = this.ctx
    const scene = this.scene
    if (ctx === null || scene === null) {
      return
    }

    // En vez de save/restore: una sola llamada, más barata en el bucle caliente.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.imageSmoothingEnabled = false

    ctx.fillStyle = scene.theme.background
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight)

    if (scene.showGrid) {
      drawGrid(ctx, scene.camera, scene.theme, this.cssWidth, this.cssHeight)
    }

    // Dos capas (M2-17): abajo lo estable (cables, uniones, símbolos), que se cachea; encima
    // los pines y el cable provisional, que cambian con el ratón y se dibujan del natural.
    const staticItems: DrawItem[] = []
    const overlayItems: DrawItem[] = []
    for (const item of scene.items) {
      if (isOverlayItem(item)) {
        overlayItems.push(item)
      } else {
        staticItems.push(item)
      }
    }

    // La caché se pinta en píxeles de dispositivo. Si el circuito no cabe (o el entorno no
    // sabe pegar imágenes), se cae al dibujado directo con recorte de vista.
    const cached = this.layerCache.paint(
      ctx,
      staticItems,
      scene.camera,
      this.dpr,
      scene.theme,
      this.cssWidth,
      this.cssHeight,
    )
    if (!cached) {
      this.applyWorldTransform(scene)
      for (const item of cullItems(staticItems, scene.camera, this.cssWidth, this.cssHeight)) {
        paintItem(ctx, item, scene.theme)
      }
    }

    if (overlayItems.length > 0) {
      this.applyWorldTransform(scene)
      for (const item of cullItems(overlayItems, scene.camera, this.cssWidth, this.cssHeight)) {
        paintItem(ctx, item, scene.theme)
      }
    }
  }

  /**
   * Deja el contexto transformado a **unidades de rejilla**.
   *
   * Así el dibujado escribe coordenadas del mundo y no sabe nada de píxeles ni de zoom. Se
   * pone una vez por capa, no por pieza.
   */
  private applyWorldTransform(scene: RenderScene): void {
    const ctx = this.ctx
    if (ctx === null) {
      return
    }
    const scale = GRID_SIZE * scene.camera.zoom
    ctx.setTransform(
      this.dpr * scale,
      0,
      0,
      this.dpr * scale,
      this.dpr * scene.camera.offsetX,
      this.dpr * scene.camera.offsetY,
    )
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
  }
}

/** Pinta una pieza suelta. Reutilizado por las dos capas. */
function paintItem(ctx: CanvasRenderingContext2D, item: DrawItem, theme: RenderTheme): void {
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
    case 'pinDot':
      drawPinDot(ctx, item, theme)
      break
    case 'label':
      drawLabel(ctx, item, theme)
      break
  }
  ctx.restore()
}
