import { describe, expect, it } from 'vitest'
import { CircuitState, DirtyList } from '../../../../src/core/simulate/circuit-state'
import { CircuitFunction, OneBitConst } from '../../../../src/core/function/circuit-function'
import { FunctionAnd } from '../../../../src/core/function/gates'
import { FunctionButton, FunctionLed } from '../../../../src/core/function/devices'
import { State } from '../../../../src/core/function/state'

/**
 * Función de prueba con un parámetro y un resultado en los índices 0.
 *
 * Es el equivalente de `TestFunction` en `CircuitStateDirtyListTest.cs`. Se declara con
 * parámetro para que `CircuitState.defineFunction` no la meta en su propia lista de sucios:
 * así el test controla la lista que está midiendo.
 */
class TestFunction extends CircuitFunction {
  order = 0

  constructor(state: CircuitState) {
    super(state, [0], [0])
  }

  override evaluate(): boolean {
    throw new Error('TestFunction no se evalúa')
  }

  override get reportName(): string {
    throw new Error('TestFunction no se dibuja')
  }
}

/** Acceso por índice, que el `CircuitState` implementa con un Proxy como el indexador de C#. */
function indexed(state: CircuitState): { [index: number]: State } {
  return state as unknown as { [index: number]: State }
}

describe('CircuitState (portado de CircuitStateTest.cs)', () => {
  it('el constructor reserva los estados pedidos', () => {
    // CircuitStateConstructorTest
    const state = new CircuitState(3)
    expect(state.count).toBe(3)
  })

  it('EndDefinition enlaza la constante con su consumidor', () => {
    // CircuitStateEndDefinitionTest: el botón escribe en el índice reservado y el LED lo lee.
    const state = new CircuitState(3)
    const buttonResult = state.reserveState()
    const button = new FunctionButton(state, false, false, buttonResult)
    const led = new FunctionLed(state, buttonResult)

    state.endDefinition()

    expect(button.dependent).toHaveLength(1)
    expect(button.dependent?.[0]).toBe(led)
    expect(led.dependent).toBeNull()
  })

  it('el indexador lee y escribe el estado', () => {
    // CircuitStateItemTest
    const state = new CircuitState(3)
    state.endDefinition()

    expect(state.count).toBe(3)
    expect(indexed(state)[0]).toBe(State.Off)
    expect(indexed(state)[1]).toBe(State.Off)
    expect(indexed(state)[2]).toBe(State.Off)

    indexed(state)[0] = State.On0
    state.set(1, State.On1)

    expect(state.get(0)).toBe(State.On0)
    expect(indexed(state)[1]).toBe(State.On1)
  })

  it('Evaluate propaga de las constantes a la compuerta', () => {
    // CircuitStateEvaluateTest
    const state = new CircuitState(3)
    new OneBitConst(state, State.On0, 0)
    new OneBitConst(state, State.On1, 1)
    FunctionAnd.create(state, [0, 1], 2)
    state.endDefinition()

    expect(state.evaluate(true)).toBe(true)
    expect(state.get(0)).toBe(State.On0)
    expect(state.get(1)).toBe(State.On1)
    expect(state.get(2)).toBe(State.On0)
  })

  it('MarkUpdated vuelve a evaluar lo que cambió', () => {
    // CircuitStateMarkUpdatedTest
    const state = new CircuitState(3)
    const first = new OneBitConst(state, State.On0, 0)
    new OneBitConst(state, State.On1, 1)
    FunctionAnd.create(state, [0, 1], 2)
    state.endDefinition()

    expect(state.evaluate(true)).toBe(true)
    expect(state.get(2)).toBe(State.On0)

    first.setState(State.On1)

    expect(state.evaluate(true)).toBe(true)
    expect(state.get(0)).toBe(State.On1)
    expect(state.get(1)).toBe(State.On1)
    expect(state.get(2)).toBe(State.On1)
  })
})

describe('DirtyList (portado de CircuitStateDirtyListTest.cs)', () => {
  it('añade y devuelve los sucios, y luego se vacía', () => {
    // DirtyListAddGetTest
    const list = new DirtyList(12345)
    const state = new CircuitState(3)
    const first = new TestFunction(state)
    const second = new TestFunction(state)

    expect(list.get()).toBeNull()

    list.add(first)
    list.add(second)

    const retrieved1 = list.get()
    const retrieved2 = list.get()
    const retrieved3 = list.get()

    expect(retrieved1 === first || retrieved1 === second).toBe(true)
    expect(retrieved2 === first || retrieved2 === second).toBe(true)
    expect(retrieved3).toBeNull()
  })

  it('devuelve todos los sucios y en un orden aleatorio', () => {
    // DirtyListOrderTest. Semilla fija para que el test no dependa de la hora.
    const list = new DirtyList(12345)
    const state = new CircuitState(3)
    const count = 100

    for (let i = 0; i < count; i++) {
      const fn = new TestFunction(state)
      fn.order = i
      list.add(fn)
    }

    const retrieved: TestFunction[] = []
    for (let i = 0; i < count; i++) {
      const fn = list.get()
      expect(fn).not.toBeNull()
      retrieved.push(fn as TestFunction)
    }

    expect(list.get()).toBeNull()
    expect(list.get()).toBeNull()
    expect(list.get()).toBeNull()

    let inversions = 0
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        if (retrieved[i]!.order > retrieved[j]!.order) {
          inversions++
        }
      }
    }

    const maxInversions = (count * (count - 1)) / 2
    expect(inversions).toBeGreaterThan(0)
    expect(inversions).toBeLessThan(maxInversions)

    retrieved.sort((a, b) => a.order - b.order)
    for (let i = 0; i < count; i++) {
      expect(retrieved[i]!.order).toBe(i)
    }
  })

  it('las oleadas no leen un sucio antes de que se añada', () => {
    // WaveTest: la lista cambia de generación a mitad de una oleada y no debe adelantar
    // funciones de la siguiente. `0` al final sirve para vaciar la última generación.
    const list = new DirtyList(12345)
    const state = new CircuitState(3)
    const retrieved: TestFunction[] = []

    const wave0 = 11
    const waves = [5, 3, 9, 0]
    let order = 0
    let count = wave0

    for (let i = 0; i < count; i++) {
      const fn = new TestFunction(state)
      fn.order = order++
      list.add(fn)
    }

    for (const wave of waves) {
      let i = 0
      for (; i < Math.floor(count / 2); i++) {
        const fn = list.get()
        expect(fn).not.toBeNull()
        retrieved.push(fn as TestFunction)
      }
      for (let j = 0; j < wave; j++) {
        const fn = new TestFunction(state)
        fn.order = order++
        list.add(fn)
      }
      for (; i < count; i++) {
        const fn = list.get()
        expect(fn).not.toBeNull()
        retrieved.push(fn as TestFunction)
      }
      count = wave
    }

    expect(list.get()).toBeNull()
    expect(retrieved).toHaveLength(wave0 + waves.reduce((sum, value) => sum + value, 0))

    let max = wave0
    let waveIndex = 0
    for (let i = 0; i < retrieved.length; i++) {
      if (max <= i) {
        max += waves[waveIndex++]!
      }
      // MSTest firma `IsLessThanOrEqualTo(upperBound, value)`, así que el original comprueba
      // que el orden recuperado no pase del máximo de la oleada actual.
      expect(retrieved[i]!.order).toBeLessThanOrEqual(max)
    }
  })
})
