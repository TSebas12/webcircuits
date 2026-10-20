import { describe, expect, it } from 'vitest'
import { FunctionMemory } from '../../../../src/core/function/memory'
import { State } from '../../../../src/core/function/state'
import { CircuitState } from '../../../../src/core/simulate/circuit-state'

/**
 * Una RAM de 2 bits de dirección y 2 de datos, con todos sus índices reservados.
 *
 * Los índices se reservan **antes** de construir la función porque `CircuitState` crea el
 * array de estados al definir la primera función: reservar después dejaría huecos fuera.
 */
function ram(): {
  state: CircuitState
  address: number[]
  dataIn: number[]
  write: number
  dataOut: number[]
  memory: FunctionMemory
} {
  const state = new CircuitState(8, 7)
  const address = [state.reserveState(), state.reserveState()]
  const dataIn = [state.reserveState(), state.reserveState()]
  const write = state.reserveState()
  const dataOut = [state.reserveState(), state.reserveState()]

  const memory = new FunctionMemory(state, address, dataIn, dataOut, write, {
    isRom: false,
    writeOn1: true,
    onStart: 'zeros',
    addressBitWidth: 2,
    dataBitWidth: 2,
  })
  state.endDefinition()

  return { state, address, dataIn, write, dataOut, memory }
}

function setBits(state: CircuitState, indexes: readonly number[], value: number): void {
  indexes.forEach((index, bit) => {
    state.set(index, ((value >> bit) & 1) === 0 ? State.On0 : State.On1)
  })
}

function readBits(state: CircuitState, indexes: readonly number[]): number {
  let value = 0
  indexes.forEach((index, bit) => {
    if (state.get(index) === State.On1) value |= 1 << bit
  })
  return value
}

describe('memoria RAM (M2-05)', () => {
  it('escribe una celda con el flanco de escritura y la deja leer', () => {
    const { state, address, dataIn, write, dataOut, memory } = ram()

    // Dirección 1, dato 2 (binario 10). La escritura se detecta en el flanco: primero
    // hay que ver el nivel inactivo y después el activo.
    setBits(state, address, 1)
    setBits(state, dataIn, 2)
    state.set(write, State.On0)
    memory.evaluate()
    state.set(write, State.On1)

    expect(memory.evaluate()).toBe(true)
    expect(readBits(state, dataOut)).toBe(2)

    // La escritura solo ocurre en el flanco: mantener el 1 no vuelve a escribir.
    setBits(state, dataIn, 3)
    expect(memory.evaluate()).toBe(false)
    expect(readBits(state, dataOut)).toBe(2)

    // Al bajar y volver a subir la escritura, sí escribe el nuevo valor.
    state.set(write, State.On0)
    memory.evaluate()
    state.set(write, State.On1)
    memory.evaluate()
    expect(readBits(state, dataOut)).toBe(3)
  })

  it('cambiar de dirección lee otra celda', () => {
    const { state, address, dataIn, write, dataOut, memory } = ram()

    setBits(state, address, 1)
    setBits(state, dataIn, 2)
    state.set(write, State.On0)
    memory.evaluate()
    state.set(write, State.On1)
    memory.evaluate()

    // Dirección 0 sigue a cero (arranque en ceros), así que la salida cambia.
    setBits(state, address, 0)
    expect(memory.evaluate()).toBe(true)
    expect(readBits(state, dataOut)).toBe(0)

    // Y al volver a la 1, el dato sigue ahí.
    setBits(state, address, 1)
    expect(memory.evaluate()).toBe(true)
    expect(readBits(state, dataOut)).toBe(2)
  })

  it('una ROM no escribe: solo lee su contenido', () => {
    const state = new CircuitState(5, 7)
    const address = [state.reserveState(), state.reserveState()]
    const dataOut = [state.reserveState(), state.reserveState()]

    const memory = new FunctionMemory(state, address, null, dataOut, 0, {
      isRom: true,
      writeOn1: true,
      onStart: 'data',
      addressBitWidth: 2,
      dataBitWidth: 2,
    })
    state.endDefinition()

    setBits(state, address, 0)
    // La primera lectura pasa los resultados de «apagado» a 0, así que avisa del cambio;
    // la segunda ya no cambia nada.
    expect(memory.evaluate()).toBe(true)
    expect(readBits(state, dataOut)).toBe(0)
    expect(memory.evaluate()).toBe(false)
  })
})
