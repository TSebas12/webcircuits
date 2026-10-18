import { GRID_SIZE } from './geometry'

/**
 * Cámara (M1-05): traduce entre **unidades de rejilla** (mundo) y **píxeles** (pantalla).
 *
 *   pantalla = offset + mundo · GRID_SIZE · zoom
 *
 * Es matemática pura: no toca el DOM ni `canvas`, así que se prueba en Node sin historias.
 * En el original esto son el `ScrollViewer` (el offset) más el `LayoutTransform`
 * del lienzo (el zoom).
 */

/** Límites de zoom (original: `Project.MinZoom` / `Project.MaxZoom`). */
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 3

/** Estado inmutable de la cámara. Es lo único que consume el renderizador. */
export interface CameraState {
  readonly offsetX: number
  readonly offsetY: number
  readonly zoom: number
}

/** Punto en píxeles de pantalla. */
export interface ScreenPoint {
  readonly x: number
  readonly y: number
}

/** Punto en unidades de rejilla, sin redondear. */
export interface WorldPoint {
  readonly x: number
  readonly y: number
}

/** Rectángulo visible, en unidades de rejilla. Se usa para no dibujar lo que no se ve. */
export interface WorldRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** Recorta el zoom a los límites permitidos. */
export function clampZoom(zoom: number): number {
  // `NaN` no se puede recortar (cualquier comparación con él es falsa): se cae a 1.
  // Un infinito sí: se recorta solo al límite que toque.
  if (Number.isNaN(zoom)) {
    return 1
  }
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** Rectángulo del mundo que cae dentro de la ventana de `width` × `height` píxeles. */
export function visibleWorldRect(camera: CameraState, width: number, height: number): WorldRect {
  const scale = GRID_SIZE * camera.zoom
  return {
    x0: -camera.offsetX / scale,
    y0: -camera.offsetY / scale,
    x1: (width - camera.offsetX) / scale,
    y1: (height - camera.offsetY) / scale,
  }
}

export class Camera {
  private offsetX = 0
  private offsetY = 0
  private currentZoom = 1

  /** Estado inmutable, para pasar al renderizador. */
  get state(): CameraState {
    return { offsetX: this.offsetX, offsetY: this.offsetY, zoom: this.currentZoom }
  }

  get zoom(): number {
    return this.currentZoom
  }

  set zoom(value: number) {
    const next = clampZoom(value)
    if (next !== this.currentZoom) {
      this.currentZoom = next
    }
  }

  /** Vuelve al estado inicial, dejando un margen a la izquierda y arriba. */
  reset(paddingX = 0, paddingY = 0): void {
    this.offsetX = paddingX
    this.offsetY = paddingY
    this.currentZoom = 1
  }

  /** Convierte una coordenada del mundo a píxeles. */
  toScreenX(worldX: number): number {
    return this.offsetX + worldX * GRID_SIZE * this.currentZoom
  }

  /** Convierte una coordenada del mundo a píxeles. */
  toScreenY(worldY: number): number {
    return this.offsetY + worldY * GRID_SIZE * this.currentZoom
  }

  /** Convierte un punto del mundo a píxeles. */
  toScreen(point: WorldPoint): ScreenPoint {
    return { x: this.toScreenX(point.x), y: this.toScreenY(point.y) }
  }

  /** Convierte píxeles a coordenadas del mundo, sin redondear. */
  toWorld(screenX: number, screenY: number): WorldPoint {
    const scale = GRID_SIZE * this.currentZoom
    return { x: (screenX - this.offsetX) / scale, y: (screenY - this.offsetY) / scale }
  }

  /** Convierte píxeles a una celda de la rejilla (redondeando). */
  toGrid(screenX: number, screenY: number): { readonly x: number; readonly y: number } {
    const world = this.toWorld(screenX, screenY)
    return { x: Math.round(world.x), y: Math.round(world.y) }
  }

  /**
   * Desplaza la vista en píxeles.
   * Es lo que hace arrastrar con el ratón.
   */
  panBy(dxPixels: number, dyPixels: number): void {
    this.offsetX += dxPixels
    this.offsetY += dyPixels
  }

  /**
   * Fija el zoom **manteniendo quieto el punto que hay bajo el cursor**.
   * Es lo que hace que la rueda del ratón no «se lleve» el dibujo.
   */
  setZoomAt(screenX: number, screenY: number, zoom: number): void {
    const next = clampZoom(zoom)
    if (next === this.currentZoom) {
      return
    }
    const anchor = this.toWorld(screenX, screenY)
    this.currentZoom = next
    const scale = GRID_SIZE * next
    this.offsetX = screenX - anchor.x * scale
    this.offsetY = screenY - anchor.y * scale
  }

  /** Multiplica el zoom por `factor`, anclando en el punto indicado. */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    this.setZoomAt(screenX, screenY, this.currentZoom * factor)
  }

  /** Deja el punto del mundo indicado en el centro de una ventana de `width` × `height` píxeles. */
  centerOn(worldX: number, worldY: number, width: number, height: number): void {
    const scale = GRID_SIZE * this.currentZoom
    this.offsetX = width / 2 - worldX * scale
    this.offsetY = height / 2 - worldY * scale
  }
}
