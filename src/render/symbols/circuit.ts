/**
 * Silueta de un subcircuito colocado.
 *
 * El original lo pinta como un rectángulo con el nombre del circuito dentro
 * (`SymbolShapes/Rectangular.xaml`). El nombre lo pone `draw.ts` como etiqueta; aquí solo
 * está la caja, para que el caché de siluetas siga dependiendo únicamente del tamaño.
 *
 * Se redondea un pelo para que no se confunda con una compuerta rectangular: un subcircuito
 * es una hoja, no una pieza lógica.
 */

import { roundedRect } from './rounded-rect'
import type { SymbolDrawing } from './index'

const INSET = 0.1

export function circuitShape(width: number, height: number): SymbolDrawing {
  const body = new Path2D()
  roundedRect(body, INSET, INSET, width - INSET * 2, height - INSET * 2, 0.3)
  return { body, bodyFill: 'symbol' }
}
