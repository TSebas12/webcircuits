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

  // El original no cambia de aspecto al sonar; aquí no hay audio todavía, así que un punto
  // de estado evita que la pieza parezca muerta cuando recibe un 1.
  const indicator = new Path2D()
  indicator.arc(w - 0.45, 0.45, 0.14, 0, Math.PI * 2)

  return { body, bodyFill: 'symbol', indicator }
}