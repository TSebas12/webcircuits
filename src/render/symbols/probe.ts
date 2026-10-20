/**
 * La silueta de una probeta (M3-09).
 *
 * El original (`SymbolShapes/Probe.xaml`) dibuja una pastilla redondeada con el valor
 * dentro. Aquí la pastilla lleva un **indicador** que se pinta con el estado del cable: el
 * valor histórico se consulta en el osciloscopio, no dentro del símbolo.
 */

import type { SymbolDrawing } from './index'
import { roundedRect } from './rounded-rect'

export function probeShape(width: number, height: number): SymbolDrawing {
  const body = new Path2D()
  roundedRect(body, 0.12, 0.12, Math.max(0, width - 0.24), Math.max(0, height - 0.24), 0.55)

  const radius = Math.max(0.18, Math.min(width, height) * 0.2)
  const indicator = new Path2D()
  indicator.arc(width / 2, height / 2, radius, 0, Math.PI * 2)

  return { body, bodyFill: 'symbol', indicator }
}
