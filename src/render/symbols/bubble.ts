/**
 * La bolita de negación: lo que convierte una AND en una NAND (M2-27).
 *
 * En el original **no es una forma aparte**: es la punta de salida de la compuerta, que se
 * dibuja rellena y perfilada cuando el pin está negado (`CircuitGlyph.AddJam` →
 * `jam.Pin.Inverted` → `Symbol.JamInvertedFill`). De ahí salen las dos medidas de aquí, que no
 * son inventadas: el radio es `Symbol.PinRadius` (3 px de una rejilla de 18) y el centro es
 * justo el pin de salida.
 *
 * Por eso el dibujo **no** pinta el puntito gris del pin cuando el pin está negado
 * (`editor.ts` los salta): en el original son la misma cosa, y pintar los dos dejaría una mota
 * dentro de la bolita.
 */

import type { SymbolDrawing } from './index'

/** Radio de la bolita, en unidades de rejilla (original: `Symbol.PinRadius / GridSize`). */
export const NEGATION_RADIUS = 3 / 18

/**
 * Añade la bolita a una silueta, en su punta de salida.
 *
 * La punta de salida está en `(width, height / 2)` porque así la coloca el modelo
 * (`layout.ts`), y es donde el original centra la elipse.
 */
export function withNegation(drawing: SymbolDrawing, width: number, height: number): SymbolDrawing {
  const bubble = new Path2D()
  bubble.arc(width, height / 2, NEGATION_RADIUS, 0, Math.PI * 2)

  return { ...drawing, bubble }
}
