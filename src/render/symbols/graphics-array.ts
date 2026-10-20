import type { SymbolDrawing } from './index'
export function graphicsArrayShape(width: number, height: number): SymbolDrawing {
  const body = new Path2D()
  body.rect(0.1, 0.1, Math.max(0, width - 0.2), Math.max(0, height - 0.2))
  return { body, bodyFill: 'symbol' }
}