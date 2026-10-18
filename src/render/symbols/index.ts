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
import { ledShape } from './led'

/** Las formas que sabemos dibujar. Irá creciendo con los símbolos nuevos. */
export type SymbolShape = 'and' | 'button' | 'led'

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
 */
export interface SymbolDrawing {
  readonly body: Path2D
  readonly bodyFill: 'symbol' | 'state'
  readonly indicator?: Path2D
}

/** Construye la silueta de una forma con un tamaño dado. */
type ShapeBuilder = (width: number, height: number) => SymbolDrawing

const BUILDERS: Readonly<Record<SymbolShape, ShapeBuilder>> = {
  and: andShape,
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
 * El LED es una compuerta (`GateType.Led`) que se dibuja con la silueta del LED; las
 * demás compuertas aún no tienen forma propia.
 */
export function shapeForGate(gateType: GateType): SymbolShape | null {
  switch (gateType) {
    case 'and':
      return 'and'
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
