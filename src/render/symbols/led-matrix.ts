/**
 * La silueta de una matriz de LED (M2-05): una caja con una rejilla de puntos.
 *
 * Igual que la matriz gráfica, todavía no se ofrece en la paleta; se dibuja para que un
 * archivo importado no muestre un cuadro vacío.
 */
import type { SymbolDrawing } from './index'
import { roundedRect } from './rounded-rect'

const INSET = 0.12
const ROWS = 4
const COLUMNS = 4
const DOT_RADIUS = 0.08

export function ledMatrixShape(width: number, height: number): SymbolDrawing {
  const w = Math.max(0, width)
  const h = Math.max(0, height)
  const body = new Path2D()
  roundedRect(body, INSET, INSET, Math.max(0, w - INSET * 2), Math.max(0, h - INSET * 2), 0.2)

  const dots = new Path2D()
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const x = INSET + ((column + 0.5) * (w - INSET * 2)) / COLUMNS
      const y = INSET + ((row + 0.5) * (h - INSET * 2)) / ROWS
      dots.moveTo(x + DOT_RADIUS, y)
      dots.arc(x, y, DOT_RADIUS, 0, Math.PI * 2)
    }
  }

  return { body, bodyFill: 'symbol', stroke: dots }
}
