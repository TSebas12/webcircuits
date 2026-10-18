/**
 * La silueta de la compuerta AND (M1-07).
 *
 * Geometría traducida de `LogicCircuit-ref/Sources/LogicCircuit/SymbolShapes/ShapedAnd.xaml`,
 * pero **normalizada a unidades de rejilla**: la forma va de (0,0) a (ancho, alto) y quien
 * dibuja decide la escala. Así la MISMA silueta sirve para cualquier zoom y para cualquier
 * número de entradas, y se construye una sola vez (el criterio de M1-07).
 *
 * Dos diferencias conscientes con el original, las dos estéticas:
 *
 * 1. El original dibuja la parte redondeada (la «D») **de tamaño fijo** y, a partir de 3
 *    entradas, estira el cuerpo con dos rayitas verticales (`topLine`/`bottomLine`) de
 *    `(entradas - 3) / 2` células cada una. Aquí la barra izquierda se calcula directa para
 *    cubrir todo el alto: mismo dibujo, menos piezas que sincronizar.
 * 2. En el original el sobrante queda descuadrado (con 4 entradas va entero abajo). Aquí
 *    se reparte por igual, que se ve mejor.
 *
 * Lo que **no** se toca: la caja del símbolo ni la posición de los pines. Eso es semántica
 * y lo manda `core/model/layout.ts`.
 */

import type { SymbolDrawing } from './index'

/** Alto de la parte redondeada, en unidades de rejilla (el original: 3 entradas centrales). */
const CORE_HEIGHT = 3

/** Cuánto se retira el cuerpo del borde de su caja, en unidades de rejilla. */
const BODY_MARGIN = 0.5

/**
 * Construye el contorno de una AND de `width` × `height` unidades de rejilla.
 *
 * No se llama desde el bucle de dibujado: las siluetas se piden a `symbolDrawing()` de
 * `./index.ts`, que las cachea.
 */
export function andShape(width: number, height: number): SymbolDrawing {
  const outline = new Path2D()

  const coreTop = (height - CORE_HEIGHT) / 2
  const coreBottom = coreTop + CORE_HEIGHT
  const radius = CORE_HEIGHT / 2
  const straightEnd = width - radius

  // El cuerpo: borde de arriba, media circunferencia (el pico) y borde de abajo.
  // El pico mira a la derecha porque en pantalla la Y crece hacia abajo y el arco se
  // recorre en sentido horario.
  outline.moveTo(0, coreTop)
  outline.lineTo(straightEnd, coreTop)
  outline.arc(straightEnd, coreTop + radius, radius, -Math.PI / 2, Math.PI / 2, false)
  outline.lineTo(0, coreBottom)
  outline.closePath()

  // La barra izquierda solo hace falta cuando el símbolo es más alto que la parte
  // redondeada: es la que sube y baja hasta cubrir todos los pines.
  const bodyTop = BODY_MARGIN
  const bodyBottom = height - BODY_MARGIN
  if (coreTop > bodyTop || coreBottom < bodyBottom) {
    outline.moveTo(0, bodyTop)
    outline.lineTo(0, bodyBottom)
  }

  return { body: outline, bodyFill: 'symbol' }
}
