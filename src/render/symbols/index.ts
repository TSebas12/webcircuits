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
import { buttonShape } from './button'
import { clockShape } from './clock'
import { ledShape } from './led'
import { notShape, triState1Shape, triState2Shape } from './not'
import { orShape, xorShape } from './or'

/** Las formas que sabemos dibujar. Irá creciendo con los símbolos nuevos. */
export type SymbolShape =
  | 'and'
  | 'not'
  | 'or'
  | 'xor'
  | 'clock'
  | 'triState1'
  | 'triState2'
  | 'button'
  | 'led'

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
 */
export interface SymbolDrawing {
  readonly body: Path2D
  readonly bodyFill: 'symbol' | 'state'
  readonly indicator?: Path2D
  readonly stroke?: Path2D
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
  button: buttonShape,
  led: ledShape,
}

/** `forma:ancho x alto` → silueta ya construida. */
const cache = new Map<string, SymbolDrawing>()

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

  const drawing = BUILDERS[shape](width, height)
  cache.set(key, drawing)
  return drawing
}

/**
 * Qué silueta le corresponde a una compuerta. `null` = todavía no sabemos dibujarla.
 *
 * ⚠️ **Lo que no se dibuja, no se pinta a medias.** Una compuerta negada (`invertedOutput`:
 * una NAND es una AND negada) devuelve `null`, porque dibujarla como una AND normal sería
 * mentir: el dibujo diría lo que el circuito no hace. La bolita de negación es el paso
 * siguiente; hasta que esté, la paleta no ofrece compuertas negadas.
 *
 * `nop`, `odd`, `even` y `probe` no entran: no son compuertas que se puedan colocar
 * (`layout.ts` las rechaza).
 */
export function shapeForGate(gateType: GateType, invertedOutput = false): SymbolShape | null {
  if (invertedOutput) {
    return null
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
