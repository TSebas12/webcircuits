import type { SymbolDrawing } from './index'

/**
 * Silueta de un display de 7 segmentos: caja con los siete segmentos dibujados.
 */
export function sevenSegmentShape(width: number, height: number): SymbolDrawing {
  const body = new Path2D()
  const w = Math.max(0, width)
  const h = Math.max(0, height)
  const t = 0.12 // grosor de segmento
  const m = 0.1 // margen
  // caja
  body.rect(m, m, w - m * 2, h - m * 2)
  // segmento a (arriba)
  body.rect(m + t, m, w - 2 * m - 2 * t, t)
  // segmento g (medio)
  body.rect(m + t, h / 2 - t / 2, w - 2 * m - 2 * t, t)
  // segmento d (abajo)
  body.rect(m + t, h - m - t, w - 2 * m - 2 * t, t)
  // segmento f (superior izquierda)
  body.rect(m, m + t, t, h / 2 - m - t)
  // segmento b (superior derecha)
  body.rect(w - m - t, m + t, t, h / 2 - m - t)
  // segmento e (inferior izquierda)
  body.rect(m, h / 2 + t / 2, t, h / 2 - m - t)
  // segmento c (inferior derecha)
  body.rect(w - m - t, h / 2 + t / 2, t, h / 2 - m - t)
  // punto decimal
  body.arc(w - m - t / 2, h - m - t / 2, t / 2, 0, Math.PI * 2)
  return { body, bodyFill: 'symbol' }
}