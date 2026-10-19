/**
 * La foto del circuito que el dibujo sabe pintar.
 *
 * Aquí se junta el motor de verdad (`CircuitMap` + `CircuitState`) con el render, que solo
 * entiende tres estados por dispositivo (`off`, `zero`, `one`). La traducción es directa
 * pero tiene dos detalles que conviene no perder:
 *
 * - **Quién manda en cada dispositivo.** Un dispositivo que *escribe* (una compuerta, un
 *   interruptor, un reloj) se pinta con lo que saca; uno que *mira* (un LED, una probeta) se
 *   pinta con lo que le llega. `CircuitMap.symbolStateIndexes` ya devuelve los índices
 *   correctos en cada caso, así que aquí no hay que saber de qué tipo es cada cosa.
 * - **El estado `Off` no es un cero.** En el original, `State.Off` es «este cable no lo
 *   empuja nadie» (alta impedancia) y se dibuja apagado, no como un 0. Un dispositivo sin
 *   función —porque el recorte lo ha tirado, porque no tiene entradas, porque está
 *   desconectado— no tiene índices y sale `off`. Eso es información, no un hueco.
 *
 * ⚠️ **Es la foto de la hoja raíz.** Un símbolo colocado dentro de un subcircuito no está en
 * el mapa de la raíz, así que no se puede pedir desde aquí; el editor de subcircuitos (M6)
 * necesitará la foto de su propia hoja.
 */

import type { CircuitState } from './circuit-state'
import { State } from '../function/state'
import type { CircuitMap } from './circuit-map'
import type { SymbolIndex } from '../model/symbol'
import type { DeviceState, Id, StoredElement } from '../model/types'

/**
 * El estado visual de cada dispositivo del circuito, por identificador.
 *
 * Los cables no salen: no tienen estado propio, lo que se pinta es el de las puntas a las
 * que tocan (original: `Editor` mira los `Jam`, no los cables).
 */
export function devicesSnapshot(
  index: SymbolIndex,
  map: CircuitMap,
  state: CircuitState,
  elements: readonly StoredElement[],
): Map<Id, DeviceState> {
  const devices = new Map<Id, DeviceState>()
  for (const element of elements) {
    if (element.kind === 'wire') {
      continue
    }
    devices.set(element.id, deviceState(state, map.symbolStateIndexes(index.symbol(element))))
  }
  return devices
}

/**
 * El estado visual que corresponde a unos índices de estado.
 *
 * Un dispositivo de varios bits (un LED de 8, una constante) se pinta como encendido si
 * **alguno** de sus bits lo está; el render todavía no sabe dibujar valores de varios bits,
 * y eso es M3B. Si ninguno está encendido pero alguno tiene un cero, el dispositivo está en
 * `zero` (apagado pero con señal); si no hay ningún índice —o todos son `Off`— está `off`.
 */
function deviceState(state: CircuitState, indexes: readonly number[]): DeviceState {
  let off = true
  for (const index of indexes) {
    const value = state.get(index)
    if (value === State.On1) {
      return 'one'
    }
    if (value === State.On0) {
      off = false
    }
  }
  return off ? 'off' : 'zero'
}
