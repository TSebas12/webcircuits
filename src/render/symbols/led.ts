/**
 * La silueta del LED (M1-11).
 *
 * Traducida de `LogicCircuit-ref/Sources/LogicCircuit/SymbolShapes/Led.xaml`, que es una
 * sola línea: un `Ellipse` con `Stroke="Black"`, `StrokeThickness="1"` y relleno variable.
 * En `CircuitGlyph.Skin` esa elipse recibe el `Width`/`Height` del lienzo del símbolo, o
 * sea que **el círculo llena la caja entera**: para un LED de 2×2 unidades de rejilla son
 * 2 unidades de diámetro con el centro en (1, 1).
 *
 * De ahí sale un detalle bonito: el pin de entrada de un LED está en (0, 1), que es
 * exactamente el punto más a la izquierda del círculo. En el original el cable entra
 * rozando el borde del LED.
 *
 * ⚠️ Todo el cuerpo va pintado con el color del estado (`bodyFill: 'state'`), porque el
 * LED entero es un indicador. Los tres colores se eligen en el tema.
 */

import type { SymbolDrawing } from './index'

export function ledShape(width: number, height: number): SymbolDrawing {
  const radius = Math.min(width, height) / 2
  const body = new Path2D()

  // `arc()` sin subpath abierto se comporta como un `moveTo`, pero no en todas las
  // versiones: mover a mano al punto de arranque cuesta una línea y evita sustos.
  body.moveTo(width / 2 + radius, height / 2)
  body.arc(width / 2, height / 2, radius, 0, Math.PI * 2)

  return { body, bodyFill: 'state' }
}
