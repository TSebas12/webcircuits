/**
 * Silueta de un repartidor de bits (M3-06).
 *
 * Es un rectángulo simple: los pines se deducen de `splitterLayout` y se dibujan por
 * encima por el render genérico. El cuerpo es un rectángulo redondeado neutro.
 */
import type { SymbolDrawing } from './index'

export function splitterShape(width: number, height: number): SymbolDrawing {
  const body = new Path2D()
  body.rect(0, 0, width, height)
  return {
    body,
    bodyFill: 'symbol',
  }
}