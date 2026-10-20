import type { SymbolDrawing } from './index'

/**
 * Silueta de un altavoz (M2-05): caja con un cono.
 */
export function soundShape(width: number, height: number): SymbolDrawing {
  const body = new Path2D()
  const w = Math.max(0, width)
  const h = Math.max(0, height)
  // caja
  body.rect(0.15, 0.15, w * 0.35, h - 0.3)
  // cono
  body.moveTo(0.15 + w * 0.35, 0.15)
  body.lineTo(w - 0.15, 0.05)
  body.lineTo(w - 0.15, h - 0.05)
  body.lineTo(0.15 + w * 0.35, h - 0.15)
  body.closePath()
  return { body, bodyFill: 'symbol' }
}