/**
 * La silueta de un sensor (M2-12).
 *
 * El original (`SymbolShapes/SensorAuto.xaml` y `SensorManual.xaml`) dibuja un borde
 * redondeado con el nombre arriba, el valor en el centro y la notación abajo. Aquí la caja
 * es la misma; el texto lo pinta `draw.ts` como etiqueta y el punto de la esquina indica el
 * estado, igual que el indicador de una probeta.
 *
 * La caja mide 4×3 unidades: es la que fija `Sensor.CircuitSymbolWidth/Height` en el
 * original, y de ella cuelga el pin de salida.
 */

import type { SymbolDrawing } from './index'
import { roundedRect } from './rounded-rect'

const INSET = 0.14
const INDICATOR_RADIUS = 0.16

export function sensorShape(width: number, height: number): SymbolDrawing {
  const body = new Path2D()
  roundedRect(
    body,
    INSET,
    INSET,
    Math.max(0, width - INSET * 2),
    Math.max(0, height - INSET * 2),
    0.55,
  )

  const indicator = new Path2D()
  indicator.arc(width - 0.62, 0.62, INDICATOR_RADIUS, 0, Math.PI * 2)

  return { body, bodyFill: 'symbol', indicator }
}
