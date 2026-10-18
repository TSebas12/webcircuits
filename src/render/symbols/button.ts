/**
 * La silueta del interruptor de entrada (M1-11).
 *
 * ⚠️ En el original esto es un `CircuitButton`, no un «switch»: el elemento que el
 * usuario pulsa para meter un 1 o un 0 (`CircuitProject/CircuitButton.cs`). Se comporta
 * distinto según su propiedad `IsToggle`, que **por defecto es `false`**
 * (`Schema/CircuitProject.xml:232`): pulsar pone un 1 y soltar vuelve a 0. Para que se
 * quede fijo hay que marcar `IsToggle`.
 *
 * Lo que sí es del original y aquí se respeta:
 *
 * - Mide **2×2 unidades de rejilla** (el `Width`/`Height` por defecto del botón).
 * - Tiene **un pin de salida a la derecha**, en (2, 1).
 * - Lleva un indicador de estado, que en el original es `SymbolShapes/ToggleLed.xaml`:
 *   una barra de 21×5 px con borde y esquinas redondeadas, anclada abajo a la izquierda.
 *
 * Lo que **no** se copia: la forma del botón. `SymbolShapes/Button.xaml` no tiene
 * geometría — es un `ButtonControl` de WPF, o sea, «el aspecto del tema de Windows».
 * No hay números que portar, así que se dibuja uno propio, más ancho y centrado: la
 * regla del proyecto dice que el comportamiento es sagrado y el aspecto es libre.
 */

import { roundedRect } from './rounded-rect'
import type { SymbolDrawing } from './index'

/** Cuánto se retira el cuerpo del borde de su caja, en unidades de rejilla. */
const BODY_MARGIN = 0.15

/** Radio de las esquinas del cuerpo, en unidades de rejilla. */
const BODY_RADIUS = 0.3

/** Dónde empieza el indicador de estado, en tanto por uno del alto. */
const INDICATOR_TOP = 0.55

/** Cuánto se retira el indicador de los lados, en unidades de rejilla. */
const INDICATOR_MARGIN = 0.3

export function buttonShape(width: number, height: number): SymbolDrawing {
  const body = new Path2D()
  roundedRect(
    body,
    BODY_MARGIN,
    BODY_MARGIN,
    width - BODY_MARGIN * 2,
    height - BODY_MARGIN * 2,
    BODY_RADIUS,
  )

  // El indicador no lleva radio propio en el original más allá de las esquinas
  // redondeadas: aquí se le pone uno proporcional para que no parezca un ladrillo.
  const indicatorTop = height * INDICATOR_TOP
  const indicatorBottom = height - INDICATOR_MARGIN
  const indicator = new Path2D()
  roundedRect(
    indicator,
    INDICATOR_MARGIN,
    indicatorTop,
    width - INDICATOR_MARGIN * 2,
    indicatorBottom - indicatorTop,
    BODY_RADIUS * 0.7,
  )

  return { body, bodyFill: 'symbol', indicator }
}
