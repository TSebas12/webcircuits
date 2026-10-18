import type { CameraState } from './camera'
import { visibleWorldRect } from './camera'
import { GRID_SIZE } from './geometry'
import type { RenderTheme } from './ir-renderer'

/**
 * La rejilla (M1-06).
 *
 * ⚠️ El original de WPF dibuja la rejilla con un pincel de mosaico de 18 × 18 px cuyo
 * punto mide ~0,7 px. El **18 es sagrado** (de él dependen la posición de los pines y el
 * ajuste), pero el aspecto es cosa nuestra: aquí se dibuja nítido y con un punto de
 * referencia más marcado cada 5 celdas. Es la parte «modernizamos la interfaz» del plan.
 */

/** Separación mínima entre puntos, en píxeles. Por debajo se apiñan y ensucian la vista. */
export const MIN_DOT_SPACING = 18

/** Cada cuántos pasos se dibuja un punto más marcado. */
export const STRONG_EVERY = 5

/** Escalones posibles del paso de rejilla, en unidades de rejilla. */
const GRID_STEPS: readonly number[] = [1, 2, 5, 10, 25, 50, 100]
const FALLBACK_STEP = 100

/**
 * Elige el paso de rejilla para que en pantalla los puntos no queden apiñados (LOD).
 *
 * A zoom 1 hay 18 px entre puntos → paso 1: una celda por punto, igual que el original.
 * Al alejar el paso crece (2, 5, 10…) para que la rejilla no se convierta en una mancha.
 */
export function chooseGridStep(zoom: number): number {
  const spacingAtZoom1 = GRID_SIZE * zoom
  for (const step of GRID_STEPS) {
    if (spacingAtZoom1 * step >= MIN_DOT_SPACING) {
      return step
    }
  }
  return FALLBACK_STEP
}

/**
 * Dibuja la rejilla sobre un contexto **ya en coordenadas de pantalla**.
 *
 * No aplica la transformada de la cámara a propósito: así los puntos caen en píxeles
 * enteros y se ven nítidos en lugar de borrosos.
 *
 * El fondo lo pinta quien llama; aquí solo van los puntos.
 *
 * Los puntos de un mismo color se acumulan en un único trazado y se rellenan de una vez
 * (un `beginPath` + muchos `rect` + un `fill`), que es muchísimo más rápido que llamar a
 * `fillRect` punto por punto.
 *
 * Número de puntos: como el paso se elige para dejar ≥ `MIN_DOT_SPACING` px entre puntos,
 * nunca se dibujan más de `(ancho/18+1) × (alto/18+1)`. En 1366 × 768 son ~3.300.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: CameraState,
  theme: RenderTheme,
  width: number,
  height: number,
): void {
  const step = chooseGridStep(camera.zoom)
  const scale = GRID_SIZE * camera.zoom
  const view = visibleWorldRect(camera, width, height)

  const dotSize = camera.zoom >= 1.5 ? 2 : 1
  const strongSize = dotSize + 1
  const strongStep = step * STRONG_EVERY

  const firstX = Math.ceil(view.x0 / step) * step
  const firstY = Math.ceil(view.y0 / step) * step
  const firstStrongX = Math.ceil(view.x0 / strongStep) * strongStep
  const firstStrongY = Math.ceil(view.y0 / strongStep) * strongStep

  // Puntos normales, saltando los que caen en la retícula marcada.
  ctx.fillStyle = theme.gridDot
  ctx.beginPath()
  for (let y = firstY; y <= view.y1; y += step) {
    const screenY = Math.round(camera.offsetY + y * scale)
    const strongRow = y % strongStep === 0
    for (let x = firstX; x <= view.x1; x += step) {
      if (strongRow && x % strongStep === 0) {
        continue
      }
      ctx.rect(Math.round(camera.offsetX + x * scale), screenY, dotSize, dotSize)
    }
  }
  ctx.fill()

  // Puntos marcados: la retícula de referencia cada `strongStep` celdas.
  ctx.fillStyle = theme.gridDotStrong
  ctx.beginPath()
  for (let y = firstStrongY; y <= view.y1; y += strongStep) {
    const screenY = Math.round(camera.offsetY + y * scale)
    for (let x = firstStrongX; x <= view.x1; x += strongStep) {
      ctx.rect(Math.round(camera.offsetX + x * scale), screenY, strongSize, strongSize)
    }
  }
  ctx.fill()
}
