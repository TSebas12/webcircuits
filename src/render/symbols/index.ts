/**
 * Registro de siluetas de símbolo.
 *
 * Una silueta se dibuja en **unidades de rejilla**: va de (0,0) a (ancho, alto). Quien
 * dibuja pone la escala. Dos ventajas:
 *
 * - La misma silueta vale para cualquier zoom: no hay que rehacerla al acercar.
 * - Se construye **una sola vez por forma y tamaño** y se reutiliza. Ése es el criterio
 *   de M1-07 y, de paso, la razón de que el bucle de dibujado no asigne memoria.
 *
 * `Path2D` es inmutable una vez construido, así que compartirlo es seguro.
 */

import type { GateType } from '../../core/model/types'
import { andShape } from './and'
import { withNegation } from './bubble'
import { buttonShape } from './button'
import { circuitShape } from './circuit'
import { clockShape } from './clock'
import { constantShape } from './constant'
import { ledShape } from './led'
import { notShape, triState1Shape, triState2Shape } from './not'
import { orShape, xorShape } from './or'
import { pinInputShape, pinOutputShape } from './pin'
import { probeShape } from './probe'
import { roundedRect } from './rounded-rect'
import { sensorShape } from './sensor'
import { splitterShape } from './splitter'

/** Las formas que sabemos dibujar. Irá creciendo con los símbolos nuevos. */
export type SymbolShape =
  | 'and'
  | 'not'
  | 'or'
  | 'xor'
  | 'clock'
  | 'triState1'
  | 'triState2'
  | 'andNeg'
  | 'notNeg'
  | 'orNeg'
  | 'xorNeg'
  | 'button'
  | 'led'
  | 'probe'
  | 'sensor'
  | 'splitter'
  | 'pinInput'
  | 'pinOutput'
  | 'constant'
  | 'circuit'

/**
 * Las partes de un símbolo.
 *
 * El **cuerpo** siempre se dibuja: se rellena y se perfila. Con qué se rellena lo decide
 * `bodyFill`:
 *
 * - `'symbol'` → un símbolo normal: la compuerta, con su relleno de siempre.
 * - `'state'`  → es todo él un indicador (el LED), y cambia de color con el estado.
 *
 * El **indicador** es opcional y siempre va pintado con el color del estado: es la barrita
 * de los interruptores, que dice de un vistazo si están en 1 o en 0.
 *
 * El **trazo** es opcional y va solo perfilado: son las rayas que no son borde del cuerpo —la
 * onda del reloj, la raya suelta de la XOR, la habilitación del tri-estado—. Van aparte
 * porque rellenarlas pintaría de más: al rellenar una curva abierta, el lienzo la cierra por
 * su cuenta y quedaría una telaraña del color del símbolo sobre el fondo.
 *
 * La **bolita** es opcional y va la última: es la negación de la salida (una NAND es una AND
 * con bolita). Se pinta tapando la punta del cuerpo, que es lo que hace el original.
 */
export interface SymbolDrawing {
  readonly body: Path2D
  readonly bodyFill: 'symbol' | 'state'
  readonly indicator?: Path2D
  readonly stroke?: Path2D
  readonly bubble?: Path2D
}

/** Construye la silueta de una forma con un tamaño dado. */
type ShapeBuilder = (width: number, height: number) => SymbolDrawing

const BUILDERS: Readonly<Record<SymbolShape, ShapeBuilder>> = {
  and: andShape,
  not: notShape,
  or: orShape,
  xor: xorShape,
  clock: clockShape,
  triState1: triState1Shape,
  triState2: triState2Shape,
  andNeg: (width, height) => withNegation(andShape(width, height), width, height),
  notNeg: (width, height) => withNegation(notShape(width, height), width, height),
  orNeg: (width, height) => withNegation(orShape(width, height), width, height),
  xorNeg: (width, height) => withNegation(xorShape(width, height), width, height),
  button: buttonShape,
  led: ledShape,
  probe: probeShape,
  sensor: sensorShape,
  splitter: splitterShape,
  pinInput: pinInputShape,
  pinOutput: pinOutputShape,
  constant: constantShape,
  circuit: circuitShape,
}

/** `forma:ancho x alto` → silueta ya construida. */
const cache = new Map<string, SymbolDrawing>()

/**
 * Caja neutra para una forma que no está en el registro.
 *
 * No se espera llegar aquí con el código actual, pero una pestaña abierta mientras se
 * actualizan los módulos (HMR) puede quedarse con una pieza nueva y una lista de siluetas
 * vieja. En ese caso es mejor enseñar una caja que tumbar el `$effect` de la vista previa:
 * una excepción ahí deja la interfaz sin responder.
 */
function unknownShape(width: number, height: number): SymbolDrawing {
  const body = new Path2D()
  roundedRect(body, 0.1, 0.1, Math.max(0, width - 0.2), Math.max(0, height - 0.2), 0.15)
  return { body, bodyFill: 'symbol' }
}

/**
 * La silueta de un símbolo, en unidades de rejilla.
 *
 * La primera vez la construye; después devuelve la misma instancia.
 */
export function symbolDrawing(shape: SymbolShape, width: number, height: number): SymbolDrawing {
  const key = `${shape}:${width}x${height}`
  const cached = cache.get(key)
  if (cached !== undefined) {
    return cached
  }

  // El `?` no es teórico: en una actualización en caliente pueden convivir una pieza nueva
  // con este registro antiguo. La caja de reserva evita que la vista previa rompa la interfaz.
  const builder = (BUILDERS as Readonly<Record<string, ShapeBuilder | undefined>>)[shape]
  const drawing = builder === undefined ? unknownShape(width, height) : builder(width, height)
  cache.set(key, drawing)
  return drawing
}

/**
 * Qué silueta le corresponde a una compuerta. `null` = todavía no sabemos dibujarla.
 *
 * Una compuerta **negada** (`invertedOutput`: una NAND es una AND negada) se dibuja con la
 * misma silueta y su bolita. Solo la niegan las cuatro que el motor sabe negar
 * (`circuit-map.ts` → `FunctionAndNot`, `FunctionOrNot`, `FunctionXorNot` y la propia NOT);
 * para las demás, `null`: dibujar una bolita que el motor ignora sería mentir.
 *
 * `nop`, `odd` y `even` no entran: no son compuertas que se puedan colocar (`layout.ts`
 * las rechaza). La probeta tampoco es una compuerta: tiene su propia forma de dispositivo,
 * sin bolita, porque no tiene salida que negar.
 */
export function shapeForGate(gateType: GateType, invertedOutput = false): SymbolShape | null {
  if (invertedOutput) {
    switch (gateType) {
      case 'and':
        return 'andNeg'
      case 'not':
        return 'notNeg'
      case 'or':
        return 'orNeg'
      case 'xor':
        return 'xorNeg'
      default:
        return null
    }
  }

  switch (gateType) {
    case 'and':
      return 'and'
    case 'not':
      return 'not'
    case 'or':
      return 'or'
    case 'xor':
      return 'xor'
    case 'clock':
      return 'clock'
    case 'triState1':
      return 'triState1'
    case 'triState2':
      return 'triState2'
    case 'led':
      return 'led'
    default:
      return null
  }
}

/** Cuántas siluetas hay construidas. Lo usan los tests para comprobar el caché. */
export function cachedSymbolCount(): number {
  return cache.size
}

/** Vacía el caché. Solo lo usan los tests. */
export function clearSymbolCache(): void {
  cache.clear()
}
