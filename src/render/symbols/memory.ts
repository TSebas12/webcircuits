/**
 * La silueta de una memoria (M2-05).
 *
 * Caja redondeada con las líneas de dirección a la izquierda y las de datos a la derecha,
 * para que en la paleta y en el lienzo se reconozca como una memoria y no como un cuadro
 * vacío. El texto (RAM/ROM) lo pinta el render como etiqueta.
 */
import type { SymbolDrawing } from './index'
import { roundedRect } from './rounded-rect'

const INSET = 0.14
const RAIL = 0.42

export function memoryShape(width: number, height: number): SymbolDrawing {
  const w = Math.max(0, width)
  const h = Math.max(0, height)
  const body = new Path2D()
  roundedRect(body, INSET, INSET, Math.max(0, w - INSET * 2), Math.max(0, h - INSET * 2), 0.25)

  // Las dos bandas laterales recuerdan a los pines de dirección (izquierda) y datos
  // (derecha). No son pines de verdad: la geometría real la calcula `layout.ts`.
  const stroke = new Path2D()
  stroke.moveTo(RAIL + INSET, INSET)
  stroke.lineTo(RAIL + INSET, h - INSET)
  stroke.moveTo(w - RAIL - INSET, INSET)
  stroke.lineTo(w - RAIL - INSET, h - INSET)

  const rows = 3
  for (let index = 0; index < rows; index += 1) {
    const y = INSET + ((index + 1) * (h - INSET * 2)) / (rows + 1)
    stroke.moveTo(INSET, y)
    stroke.lineTo(RAIL + INSET, y)
    stroke.moveTo(w - RAIL - INSET, y)
    stroke.lineTo(w - INSET, y)
  }

  return { body, bodyFill: 'symbol', stroke }
}
