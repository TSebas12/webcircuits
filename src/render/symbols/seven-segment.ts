/**
 * La silueta de un display de 7 segmentos (M2-05).
 *
 * Traducida de `SymbolShapes/SevenSegment.xaml`: una caja redondeada con los siete
 * segmentos (a-g) y el punto decimal, inclinados −8° como en el original.
 *
 * Los segmentos van **aparte del cuerpo** (`segments`) porque el render los colorea uno a
 * uno: `DrawDevice.segmentStates` trae el estado de cada entrada y el display enciende solo
 * los que reciben un 1. Si se metieran en el cuerpo, se rellenarían del mismo color que la
 * caja y el display volvería a parecer un cuadro.
 */
import type { SymbolDrawing } from './index'
import { roundedRect } from './rounded-rect'

/** Lienzo del original, en píxeles (`SevenSegment.xaml`). */
const ORIGINAL_WIDTH = 54
const ORIGINAL_HEIGHT = 90

/** Transformación del `Canvas` del original: `SkewTransform AngleX="-8"` + traslación (8, 1). */
const SKEW = Math.tan((8 * Math.PI) / 180)
const OFFSET_X = 8
const OFFSET_Y = 1

/** Grosor de los segmentos (`StrokeThickness="5"`). */
const SEGMENT_WIDTH = 5

/**
 * Los segmentos, en el orden de los pines (`Led7Pin1..7` = a..g).
 *
 * Cada línea son dos puntos del original. El punto decimal se añade aparte porque es una
 * elipse, no una línea.
 */
const SEGMENTS: readonly (readonly [number, number, number, number])[] = [
  [12, 9, 39, 9], // a
  [42, 12, 42, 41], // b
  [42, 47, 42, 76], // c
  [12, 79, 39, 79], // d
  [9, 47, 9, 76], // e
  [9, 12, 9, 41], // f
  [12, 44, 39, 44], // g
]

export function sevenSegmentShape(width: number, height: number): SymbolDrawing {
  const w = Math.max(0, width)
  const h = Math.max(0, height)
  const scaleX = w / ORIGINAL_WIDTH
  const scaleY = h / ORIGINAL_HEIGHT

  // El original inclina los segmentos dentro de la caja, no la caja entera.
  const point = (x: number, y: number): { x: number; y: number } => ({
    x: (x - y * SKEW + OFFSET_X) * scaleX,
    y: (y + OFFSET_Y) * scaleY,
  })

  const body = new Path2D()
  roundedRect(body, 0.02, 0.02, Math.max(0, w - 0.04), Math.max(0, h - 0.04), 3 / 18)

  const segments: Path2D[] = SEGMENTS.map(([x1, y1, x2, y2]) => {
    const start = point(x1, y1)
    const end = point(x2, y2)
    const path = new Path2D()
    path.moveTo(start.x, start.y)
    path.lineTo(end.x, end.y)
    return path
  })

  // El punto decimal es una elipse de 6×6 px; con un trazo redondo, una línea casi nula
  // basta para que el render lo pinte como un punto.
  const dot = point(48, 80)
  const dotPath = new Path2D()
  dotPath.moveTo(dot.x, dot.y)
  dotPath.lineTo(dot.x + 0.001, dot.y)
  segments.push(dotPath)

  return {
    body,
    bodyFill: 'symbol',
    segments,
    segmentWidth: SEGMENT_WIDTH * Math.min(scaleX, scaleY),
  }
}
