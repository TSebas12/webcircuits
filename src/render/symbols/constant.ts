/**
 * Silueta de una constante.
 *
 * El original la dibuja como un `Border` redondeado con el valor dentro
 * (`SymbolShapes/Constant.xaml`). El valor lo pinta `draw.ts` como etiqueta, porque cambia
 * con el elemento y no con la forma: así la silueta se puede cachear por tamaño.
 */

import { roundedRect } from './rounded-rect'
import type { SymbolDrawing } from './index'

const INSET = 0.16

export function constantShape(width: number, height: number): SymbolDrawing {
  const body = new Path2D()
  roundedRect(body, INSET, INSET, width - INSET * 2, height - INSET * 2, 0.45)
  return { body, bodyFill: 'symbol' }
}
