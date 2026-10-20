/**
 * La silueta de una matriz gráfica (M2-05): una caja con una rejilla de píxeles.
 *
 * Todavía no se ofrece en la paleta (no tiene pines ni simulación), pero un archivo
 * importado que la contenga debe verse como algo y no como un cuadro vacío.
 */
import type { SymbolDrawing } from './index'
import { roundedRect } from './rounded-rect'

const INSET = 0.12
const CELLS = 4

export function graphicsArrayShape(width: number, height: number): SymbolDrawing {
  const w = Math.max(0, width)
  const h = Math.max(0, height)
  const body = new Path2D()
  roundedRect(body, INSET, INSET, Math.max(0, w - INSET * 2), Math.max(0, h - INSET * 2), 0.2)

  const grid = new Path2D()
  for (let index = 1; index < CELLS; index += 1) {
    const x = INSET + (index * (w - INSET * 2)) / CELLS
    const y = INSET + (index * (h - INSET * 2)) / CELLS
    grid.moveTo(x, INSET)
    grid.lineTo(x, h - INSET)
    grid.moveTo(INSET, y)
    grid.lineTo(w - INSET, y)
  }

  return { body, bodyFill: 'symbol', stroke: grid }
}
