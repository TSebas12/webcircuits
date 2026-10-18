import { describe, expect, it } from 'vitest'
import { Diagram } from '../../../../src/core/model/diagram'
import { placedPins } from '../../../../src/core/model/layout'
import { MiniEngine, type SimulationState } from '../../../../src/core/simulate/engine'
import { Nets } from '../../../../src/core/simulate/nets'
import type {
  Button,
  DeviceState,
  Gate,
  GateType,
  GridPoint,
  Id,
  Wire,
} from '../../../../src/core/model/types'

function wire(id: string, p1: GridPoint, p2: GridPoint): Wire {
  return { kind: 'wire', id, circuitId: 'main', p1, p2, bitWidth: 1 }
}

/** El punto de un pin concreto. Revienta si no existe: en un test eso es un fallo, no un `undefined`. */
function pinAt(device: Gate | Button, type: 'input' | 'output', index = 0): GridPoint {
  const matching = placedPins(device).filter((entry) => entry.pin.type === type)
  const found = matching[index]
  if (found === undefined) {
    throw new Error(`El dispositivo no tiene un pin ${type} en la posición ${index}`)
  }
  return found.point
}

describe('nodos eléctricos (Nets)', () => {
  it('dos cables que comparten un extremo son el mismo nodo', () => {
    const nets = new Nets([
      wire('w1', { x: 0, y: 0 }, { x: 5, y: 0 }),
      wire('w2', { x: 5, y: 0 }, { x: 5, y: 4 }),
    ])

    expect(nets.connected({ x: 0, y: 0 }, { x: 5, y: 4 })).toBe(true)
    expect(nets.connected({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(true)
  })

  it('un cable no conecta con lo que no toca', () => {
    const nets = new Nets([wire('w1', { x: 0, y: 0 }, { x: 5, y: 0 })])

    expect(nets.connected({ x: 0, y: 0 }, { x: 9, y: 9 })).toBe(false)
    // Un cable NO conecta por cruzarse: solo por compartir extremo. (El original sí
    // contempla las T y los cruces; eso es M2.)
    expect(nets.connected({ x: 2, y: 0 }, { x: 2, y: 5 })).toBe(false)
  })

  it('un punto sin cables es un nodo de sí mismo', () => {
    const nets = new Nets([])

    expect(nets.connected({ x: 3, y: 3 }, { x: 3, y: 3 })).toBe(true)
    expect(nets.connected({ x: 3, y: 3 }, { x: 3, y: 4 })).toBe(false)
  })
})

/**
 * El circuito del corte vertical: dos interruptores → una AND → un LED.
 * Es exactamente el que coloca el botón «Ejemplo» del editor.
 */
function slice(): {
  readonly diagram: Diagram
  readonly engine: MiniEngine
  readonly inputs: readonly Id[]
  readonly led: Id
} {
  const diagram = new Diagram()

  const first = diagram.addButton({ x: 2, y: 2 }) // salida en (4, 3)
  const second = diagram.addButton({ x: 2, y: 4 }) // salida en (4, 5)
  const gate = diagram.addGate('and', { x: 8, y: 2 }, 2) // entradas en (8,3) y (8,5)
  const led = diagram.addGate('led', { x: 14, y: 3 }, 1) // entrada en (14, 4)

  diagram.addWire(pinAt(first, 'output'), pinAt(gate, 'input', 0))
  diagram.addWire(pinAt(second, 'output'), pinAt(gate, 'input', 1))
  diagram.addWire(pinAt(gate, 'output'), pinAt(led, 'input'))

  return { diagram, engine: new MiniEngine(), inputs: [first.id, second.id], led: led.id }
}

describe('el corte vertical: interruptores → AND → LED (M1-13 y M1-14)', () => {
  it('con las dos entradas a 0, el LED está encendido pero en 0', () => {
    const { diagram, engine, led } = slice()

    // «encendido pero en 0» no es lo mismo que «apagado»: por eso el estado tiene tres
    // valores y no un simple booleano.
    expect(engine.evaluate(diagram.elements).devices.get(led)).toBe('zero')
  })

  it('con una sola entrada a 1 el LED sigue a 0: es una AND', () => {
    const { diagram, engine, inputs, led } = slice()
    engine.setPressed(inputs[0] ?? '', true)

    expect(engine.evaluate(diagram.elements).devices.get(led)).toBe('zero')
  })

  it('con las dos entradas a 1 el LED se enciende', () => {
    const { diagram, engine, inputs, led } = slice()
    engine.setPressed(inputs[0] ?? '', true)
    engine.setPressed(inputs[1] ?? '', true)

    expect(engine.evaluate(diagram.elements).devices.get(led)).toBe('one')
  })

  it('al soltar una entrada el LED se apaga', () => {
    const { diagram, engine, inputs, led } = slice()
    engine.setPressed(inputs[0] ?? '', true)
    engine.setPressed(inputs[1] ?? '', true)
    expect(engine.evaluate(diagram.elements).devices.get(led)).toBe('one')

    engine.setPressed(inputs[1] ?? '', false)

    expect(engine.evaluate(diagram.elements).devices.get(led)).toBe('zero')
  })

  it('con el circuito apagado todo está apagado, aunque las entradas estén a 1', () => {
    const { diagram, engine, inputs, led } = slice()
    engine.setPressed(inputs[0] ?? '', true)
    engine.setPressed(inputs[1] ?? '', true)
    engine.setPowered(false)

    const state = engine.evaluate(diagram.elements)

    expect(state.powered).toBe(false)
    expect(state.devices.get(led)).toBe('off')
    expect(state.devices.get(inputs[0] ?? '')).toBe('off')
  })

  it('un nodo sin nadie que lo empuje vale 0', () => {
    const { diagram, engine, led } = slice()
    const state = engine.evaluate(diagram.elements)

    // En el mapa solo están los nodos que alguien empuja; los demás valen 0. Es la misma
    // convención que se usa dentro del motor, y por eso aquí se lee con `?? 0`.
    expect(state.nets.get('14,4') ?? 0).toBe(0)
    expect(state.devices.get(led)).toBe('zero')
  })

  it('un interruptor invertido da la vuelta a su valor', () => {
    const diagram = new Diagram()
    const engine = new MiniEngine()
    // Invertido: pulsado da 0 y suelto da 1. Es la regla de `FunctionButton`.
    const inverted = diagram.addButton({ x: 2, y: 2 }, { inverted: true })

    expect(engine.evaluate(diagram.elements).devices.get(inverted.id)).toBe('one')

    engine.setPressed(inverted.id, true)

    expect(engine.evaluate(diagram.elements).devices.get(inverted.id)).toBe('zero')
  })

  it('el interruptor nace momentáneo, como en el original', () => {
    const diagram = new Diagram()

    // `Schema/CircuitProject.xml:232` → `IsToggle` Default="false".
    expect(diagram.addButton({ x: 2, y: 2 }).isToggle).toBe(false)
    expect(diagram.addButton({ x: 6, y: 2 }, { isToggle: true }).isToggle).toBe(true)
  })
})

/** Monta una compuerta con sus entradas y lee su salida a través de un LED. */
function runGate(
  gateType: GateType,
  inputs: readonly boolean[],
  invertedOutput = false,
): DeviceState {
  const diagram = new Diagram()
  const engine = new MiniEngine()

  const gate = diagram.addGate(gateType, { x: 8, y: 2 }, Math.max(1, inputs.length), invertedOutput)
  const led = diagram.addGate('led', { x: 14, y: 3 }, 1)
  diagram.addWire(pinAt(gate, 'output'), pinAt(led, 'input'))

  inputs.forEach((value, index) => {
    const button = diagram.addButton({ x: 2, y: 2 + index * 2 })
    diagram.addWire(pinAt(button, 'output'), pinAt(gate, 'input', index))
    if (value) {
      engine.setPressed(button.id, true)
    }
  })

  return engine.evaluate(diagram.elements).devices.get(led.id) ?? 'off'
}

describe('tablas de verdad (contra lo que dice el original)', () => {
  const cases: readonly (readonly boolean[])[] = [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ]

  it('AND: solo da 1 con todas las entradas a 1', () => {
    expect(cases.map((inputs) => runGate('and', inputs))).toEqual(['zero', 'zero', 'zero', 'one'])
  })

  it('NAND: es una AND con la salida negada (así se hace en el original)', () => {
    expect(cases.map((inputs) => runGate('and', inputs, true))).toEqual([
      'one',
      'one',
      'one',
      'zero',
    ])
  })

  it('OR: basta con una entrada a 1', () => {
    expect(cases.map((inputs) => runGate('or', inputs))).toEqual(['zero', 'one', 'one', 'one'])
  })

  it('XOR: da 1 con un número impar de entradas a 1', () => {
    expect(cases.map((inputs) => runGate('xor', inputs))).toEqual(['zero', 'one', 'one', 'zero'])
  })

  it('NOT: da la vuelta a su única entrada', () => {
    expect([runGate('not', [false]), runGate('not', [true])]).toEqual(['one', 'zero'])
  })

  it('una compuerta de 3 entradas también respeta la tabla', () => {
    expect(runGate('and', [true, true, false])).toBe('zero')
    expect(runGate('and', [true, true, true])).toBe('one')
    expect(runGate('xor', [true, true, true])).toBe('one')
  })
})

describe('lo que el motor de M1 todavía no hace', () => {
  it('un cable sin conectar a nada no inventa corriente', () => {
    const diagram = new Diagram()
    const engine = new MiniEngine()
    diagram.addWire({ x: 0, y: 0 }, { x: 3, y: 0 })

    const state: SimulationState = engine.evaluate(diagram.elements)

    expect([...state.nets.values()].every((value) => value === 0)).toBe(true)
  })
})
