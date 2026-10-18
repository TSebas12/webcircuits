import { describe, expect, it } from 'vitest'
import { Camera } from '../../../src/render/camera'
import { GRID_SIZE } from '../../../src/render/geometry'
import { MIN_DOT_SPACING, STRONG_EVERY, chooseGridStep, drawGrid } from '../../../src/render/grid'
import type { RenderTheme } from '../../../src/render/ir-renderer'

const THEME: RenderTheme = {
  background: '#ffffff',
  gridDot: '#d5d9e0',
  gridDotStrong: '#aeb5c1',
  wire: '#22252b',
  symbolFill: '#ffffff',
  symbolStroke: '#22252b',
  selection: '#3b82f6',
}

/** Un rectángulo tal y como lo recibe `ctx.rect`. */
type Rect = [x: number, y: number, width: number, height: number]

/** Un `fill()`: el color con el que se rellenó y los rectángulos acumulados. */
interface FillGroup {
  readonly fillStyle: string
  readonly rects: Rect[]
}

/**
 * Contexto de mentira que apunta lo que se dibuja.
 *
 * Imita el ciclo real: se fija `fillStyle`, se abre un trazado con `beginPath`, se
 * acumulan `rect` y un `fill` los vuelca de golpe.
 */
function makeContextRecorder(): {
  ctx: CanvasRenderingContext2D
  groups: FillGroup[]
} {
  const groups: FillGroup[] = []
  let fillStyle = ''
  let pending: Rect[] = []

  const fake = {
    get fillStyle(): string {
      return fillStyle
    },
    set fillStyle(value: string) {
      fillStyle = value
    },
    beginPath(): void {
      pending = []
    },
    rect(x: number, y: number, width: number, height: number): void {
      pending.push([x, y, width, height])
    },
    fill(): void {
      groups.push({ fillStyle, rects: pending })
      pending = []
    },
  }

  // El contexto falso solo implementa lo que usa `drawGrid`; el reparto de tipos de
  // `CanvasRenderingContext2D` es enorme y no merece la pena reproducirlo entero.
  return { ctx: fake as unknown as CanvasRenderingContext2D, groups }
}

/** Todos los rectángulos dibujados, en orden. */
function allRects(groups: FillGroup[]): Rect[] {
  return groups.flatMap((group) => group.rects)
}

/** Cuenta los puntos que se dibujarían con un zoom dado en una ventana de 360 × 360. */
function countDots(zoom: number): number {
  const { ctx, groups } = makeContextRecorder()
  const camera = new Camera()
  camera.zoom = zoom
  drawGrid(ctx, camera.state, THEME, 360, 360)
  return allRects(groups).length
}

describe('chooseGridStep (LOD de la rejilla)', () => {
  it('a zoom 1 usa una celda por punto, como el original', () => {
    expect(chooseGridStep(1)).toBe(1)
  })

  it('al acercar sigue usando una celda por punto', () => {
    expect(chooseGridStep(2)).toBe(1)
    expect(chooseGridStep(3)).toBe(1)
  })

  it('al alejar va subiendo de escalón', () => {
    expect(chooseGridStep(0.5)).toBe(2)
    expect(chooseGridStep(0.2)).toBe(5)
    expect(chooseGridStep(0.1)).toBe(10)
  })

  it('nunca deja los puntos más juntos que el mínimo', () => {
    for (const zoom of [0.1, 0.15, 0.25, 0.3, 0.5, 0.75, 1, 1.5, 2, 2.5, 3]) {
      expect(GRID_SIZE * zoom * chooseGridStep(zoom)).toBeGreaterThanOrEqual(MIN_DOT_SPACING)
    }
  })

  it('el paso crece al alejarse y nunca decrece al acercarse', () => {
    let previous = Number.POSITIVE_INFINITY
    for (const zoom of [0.1, 0.2, 0.35, 0.5, 0.8, 1, 1.5, 2, 3]) {
      const step = chooseGridStep(zoom)
      expect(step).toBeLessThanOrEqual(previous)
      previous = step
    }
  })

  it('la retícula marcada cae donde toca', () => {
    expect(STRONG_EVERY).toBe(5)
    expect(chooseGridStep(1) * STRONG_EVERY).toBe(5)
  })
})

describe('drawGrid', () => {
  const SIZE = 360
  const ZOOM_1 = 1

  it('dibuja dos capas: puntos normales y puntos marcados', () => {
    const { ctx, groups } = makeContextRecorder()
    const camera = new Camera()
    drawGrid(ctx, camera.state, THEME, SIZE, SIZE)

    expect(groups.map((group) => group.fillStyle)).toEqual([THEME.gridDot, THEME.gridDotStrong])
    expect(allRects(groups).length).toBeGreaterThan(0)
  })

  it('los puntos caen en píxeles enteros (de ahí que se vean nítidos)', () => {
    const { ctx, groups } = makeContextRecorder()
    const camera = new Camera()
    camera.panBy(7.3, -11.7) // un desplazamiento feo a propósito
    drawGrid(ctx, camera.state, THEME, SIZE, SIZE)

    for (const rect of allRects(groups)) {
      expect(Number.isInteger(rect[0])).toBe(true)
      expect(Number.isInteger(rect[1])).toBe(true)
    }
  })

  it('no dibuja nada fuera de la ventana', () => {
    const { ctx, groups } = makeContextRecorder()
    const camera = new Camera()
    camera.panBy(-33, 17)
    camera.zoom = 1.4
    drawGrid(ctx, camera.state, THEME, SIZE, SIZE)

    for (const rect of allRects(groups)) {
      expect(rect[0]).toBeGreaterThanOrEqual(0)
      expect(rect[1]).toBeGreaterThanOrEqual(0)
      expect(rect[0]).toBeLessThanOrEqual(SIZE)
      expect(rect[1]).toBeLessThanOrEqual(SIZE)
    }
  })

  it('a zoom 1 la retícula marcada cae cada 5 celdas, o sea cada 90 px', () => {
    const { ctx, groups } = makeContextRecorder()
    const camera = new Camera()
    camera.zoom = ZOOM_1
    drawGrid(ctx, camera.state, THEME, SIZE, SIZE)

    const strong = groups[1]
    expect(strong).toBeDefined()
    const columnas = [...new Set((strong?.rects ?? []).map((rect) => rect[0]))].sort(
      (a, b) => a - b,
    )
    expect(columnas).toEqual([0, 90, 180, 270, 360])
  })

  it('los puntos normales no pisan los marcados (no se dibuja dos veces)', () => {
    const { ctx, groups } = makeContextRecorder()
    const camera = new Camera()
    camera.zoom = ZOOM_1
    drawGrid(ctx, camera.state, THEME, SIZE, SIZE)

    const key = (rect: Rect): string => `${rect[0]},${rect[1]}`
    const normal = new Set((groups[0]?.rects ?? []).map(key))
    const strong = new Set((groups[1]?.rects ?? []).map(key))
    const repetidos = [...normal].filter((posicion) => strong.has(posicion))

    expect(repetidos).toEqual([])
  })

  it('la rejilla nunca se convierte en una mancha: la densidad está acotada', () => {
    const maximo = (SIZE / MIN_DOT_SPACING + 1) ** 2

    for (const zoom of [0.1, 0.2, 0.25, 0.5, 0.75, 1, 1.5, 2, 3]) {
      expect(countDots(zoom)).toBeLessThanOrEqual(maximo)
    }
  })

  it('al alejarse el paso compensa: la densidad en pantalla no cambia', () => {
    // Ésta es la gracia del LOD: da igual lo lejos que esté la vista, los puntos siguen
    // separados ~18 px. Si el paso no subiera, alejarse multiplicaría los puntos.
    expect(countDots(1)).toBe(countDots(0.5))
    expect(countDots(0.5)).toBe(countDots(0.1))
  })

  it('a zoom 1 se ve una celda por punto: 360 px / 18 px = 20 celdas', () => {
    expect(countDots(1)).toBe(21 * 21)
  })

  it('acercar sube el detalle y baja el recuento: se ve menos circuito, más grande', () => {
    expect(countDots(3)).toBeLessThan(countDots(1))
  })
})
