/**
 * La silueta de un display de 7 segmentos (M2-05).
 *
 * Una caja rectangular con los siete segmentos dibujados como trazos.
 */
import type { SymbolDrawing } from './index'

const INSET = 0.12

export function sevenSegmentShape(width: number, height: number): SymbolDrawing {
  const body = new Path2D()
  // caja
  body.rect(INSET, INSET, Math.max(0, width - INSET * 2), Math.max(0, height - INSET * 2))
  return { body, bodyFill: 'symbol' }
}
