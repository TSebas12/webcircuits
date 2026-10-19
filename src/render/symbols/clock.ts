/**
 * La silueta del reloj (M2-27).
 *
 * Traducida de `SymbolShapes/Clock.xaml`: un rectángulo redondeado con una onda cuadrada
 * dentro. La onda no se inventa nada —es la señal que saca el reloj— y sus coordenadas salen
 * tal cual del original, divididas por 18 para pasar a unidades de rejilla.
 *
 * ⚠️ **El color.** En el original la onda va en verde (`#FF4EAC0E`) y el fondo del reloj es un
 * recurso del tema. Aquí se dibuja con el color del símbolo y su contorno, como los demás:
 * meter un color literal en el render rompería la regla de M2-14 (cero colores en el código) y
 * el token propio del reloj es cosa de los temas (M6).
 */

import type { SymbolDrawing } from './index'
import { roundedRect } from './rounded-rect'

/** Radio de las esquinas, en unidades de rejilla (el original: `CornerRadius="6"`). */
const CORNER_RADIUS = 6 / 18

/**
 * La onda cuadrada, en píxeles del original (`2,27 7,27 7,7 16.5,7 16.5,27 25,27 25,7 32,7`),
 * pasada a unidades de rejilla.
 */
const WAVE: readonly (readonly [number, number])[] = [
  [2 / 18, 27 / 18],
  [7 / 18, 27 / 18],
  [7 / 18, 7 / 18],
  [16.5 / 18, 7 / 18],
  [16.5 / 18, 27 / 18],
  [25 / 18, 27 / 18],
  [25 / 18, 7 / 18],
  [32 / 18, 7 / 18],
]

/** La silueta de un reloj: la caja redondeada y la onda. */
export function clockShape(width: number, height: number): SymbolDrawing {
  // Un pequeño margen para que el trazo del borde no se corte por la mitad al pintar:
  // el trazo se centra en el contorno, así que sin margen la mitad del borde queda fuera.
  const inset = 0.05
  const body = new Path2D()
  roundedRect(body, inset, inset, width - inset * 2, height - inset * 2, CORNER_RADIUS)

  const wave = new Path2D()
  WAVE.forEach(([x, y], index) => {
    if (index === 0) {
      wave.moveTo(x, y)
    } else {
      wave.lineTo(x, y)
    }
  })

  return { body, bodyFill: 'symbol', stroke: wave }
}
