import { drawDevice, drawPinDot, drawWire } from './draw'
import { GRID_SIZE } from './geometry'
import { drawGrid } from './grid'
import type { IRenderer, RenderScene, RendererOptions, RendererStats } from './ir-renderer'

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

    // Las piezas viven en unidades de rejilla, así que basta con un solo transform para
    // todas: se pone una vez y el bucle dibuja en coordenadas del mundo.
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

    for (const item of scene.items) {
      switch (item.kind) {
        case 'wire':
          drawWire(ctx, item, scene.theme)
          break
        case 'device':
          drawDevice(ctx, item, scene.theme)
          break
        case 'pinDot':
          drawPinDot(ctx, item, scene.theme)
          break
      }
    }
  }
}
