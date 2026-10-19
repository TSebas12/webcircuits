/**
 * Silueta de un pin de hoja (M3-03).
 *
 * En el original es un `Border` redondeado con el nombre dentro
 * (`SymbolShapes/Pin.xaml`). La punta del pin no forma parte del cuerpo: la dibuja el
 * render genérico en el punto que calcula `layout.ts`.
 *
 * El triángulo dice hacia dónde mira el pin: hacia dentro de la hoja si es de entrada y
 * hacia fuera si es de salida. Es el mismo lenguaje que usan las flechas del original y
 * evita confundir un pin de entrada con uno de salida cuando el nombre está vacío.
 */

import { roundedRect } from './rounded-rect'
import type { SymbolDrawing } from './index'

const INSET = 0.18

function pinShape(width: number, height: number, pointsRight: boolean): SymbolDrawing {
  const body = new Path2D()
  roundedRect(body, INSET, INSET, width - INSET * 2, height - INSET * 2, 0.55)

  // Un cheurón pequeño junto a la punta. No rellena: solo perfila, como las rayas de la
  // XOR, para que el cuerpo siga siendo una caja limpia.
  const arrow = new Path2D()
  const midY = height / 2
  const tipX = pointsRight ? width - 0.55 : 0.55
  const backX = pointsRight ? width - 0.95 : 0.95
  arrow.moveTo(backX, midY - 0.28)
  arrow.lineTo(tipX, midY)
  arrow.lineTo(backX, midY + 0.28)

  return { body, bodyFill: 'symbol', stroke: arrow }
}

/** Pin de entrada: la punta asoma por la derecha del cuadradito. */
export function pinInputShape(width: number, height: number): SymbolDrawing {
  return pinShape(width, height, true)
}

/** Pin de salida: la punta asoma por la izquierda. */
export function pinOutputShape(width: number, height: number): SymbolDrawing {
  return pinShape(width, height, false)
}
