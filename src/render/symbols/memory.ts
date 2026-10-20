/**
 * La silueta de una memoria (M2-05).
 *
 * Caja rectangular simple; el texto (ROM/RAM) lo pinta el render como etiqueta.
 */
import type { SymbolDrawing } from './index'
import { roundedRect } from './rounded-rect'

const INSET = 0.14

export function memoryShape(width: number, height: number): SymbolDrawing {
  const body = new Path2D()
  roundedRect(
    body,
    INSET,
    INSET,
    Math.max(0, width - INSET * 2),
    Math.max(0, height - INSET * 2),
    0.25,
  )
  return { body, bodyFill: 'symbol' }
}
