// @vitest-environment jsdom
//
// Tests de integración del ciclo completo (M2-29): se monta un circuito a mano,
// se le da corriente, se pulsan los interruptores y se comprueba la salida del LED.
// No pasan por el editor ni por el DOM: usan la misma fontanería que la aplicación
// (Simulation), así que un fallo aquí es un fallo real del motor.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Simulation } from '../../../src/app/simulation'
import type { Button, Element, Gate, Wire } from '../../../src/core/model/types'

function gate(id: string, position: { x: number; y: number }, gateType: Gate['gateType'], inputCount: number, invertedOutput = false): Gate {
  return {
    kind: 'gate',
    id,
    circuitId: 'main',
    layerId: 'principal',
    position,
    rotation: 'up',
    gateType,
    inputCount,
    invertedOutput,
  }
}

function button(id: string, position: { x: number; y: number }): Button {
  return {
    kind: 'button',
    id,
    circuitId: 'main',
    layerId: 'principal',
    position,
    rotation: 'up',
    isToggle: true,
    inverted: false,
  }
}

function wire(id: string, x1: number, y1: number, x2: number, y2: number): Wire {
  return {
    kind: 'wire',
    id,
    circuitId: 'main',
    layerId: 'principal',
    p1: { x: x1, y: y1 },
    p2: { x: x2, y: y2 },
    bitWidth: 1,
  }
}

function twoInput(kind: Gate['gateType'], invertedOutput = false): Element[] {
  return [
    button('b1', { x: 0, y: 0 }),
    button('b2', { x: 0, y: 4 }),
    gate('g', { x: 6, y: 0 }, kind, 2, invertedOutput),
    gate('led', { x: 12, y: 1 }, 'led', 1),
    wire('w1', 2, 1, 6, 1),
    wire('w2', 2, 5, 6, 3),
    wire('w3', 9, 2, 12, 2),
  ]
}

function run(elements: Element[], pressed: string[]): 'off' | 'zero' | 'one' {
  const simulation = new Simulation()
  simulation.setPowered(true)
  simulation.evaluate(elements)
  for (const id of pressed) {
    simulation.setPressed(id, true)
  }
  return simulation.evaluate(elements).devices.get('led') ?? 'off'
}

beforeEach(() => {
  vi.useFakeTimers()
})

describe('ciclo crear → cablear → simular → salida (M2-29)', () => {
  it('AND: solo se enciende con las dos entradas a 1', () => {
    const elements = twoInput('and')
    expect(run(elements, [])).toBe('zero')
    expect(run(elements, ['b1'])).toBe('zero')
    expect(run(elements, ['b2'])).toBe('zero')
    expect(run(elements, ['b1', 'b2'])).toBe('one')
  })

  it('OR: se enciende con al menos una entrada a 1', () => {
    const elements = twoInput('or')
    expect(run(elements, [])).toBe('zero')
    expect(run(elements, ['b1'])).toBe('one')
    expect(run(elements, ['b2'])).toBe('one')
    expect(run(elements, ['b1', 'b2'])).toBe('one')
  })

  it('XOR: se enciende con exactamente una entrada a 1', () => {
    const elements = twoInput('xor')
    expect(run(elements, [])).toBe('zero')
    expect(run(elements, ['b1'])).toBe('one')
    expect(run(elements, ['b2'])).toBe('one')
    expect(run(elements, ['b1', 'b2'])).toBe('zero')
  })

  it('NAND: nace negada — las dos a 1 apagan el LED', () => {
    const elements = twoInput('and', true)
    expect(run(elements, [])).toBe('one')
    expect(run(elements, ['b1', 'b2'])).toBe('zero')
  })

  it('NOT: nace negada — entrada 0 da 1, entrada 1 da 0', () => {
    const elements: Element[] = [
      button('b1', { x: 0, y: 0 }),
      gate('g', { x: 6, y: -1 }, 'not', 1, true),
      gate('led', { x: 12, y: 0 }, 'led', 1),
      wire('w1', 2, 1, 6, 1),
      wire('w2', 9, 1, 12, 1),
    ]
    expect(run(elements, [])).toBe('one')
    expect(run(elements, ['b1'])).toBe('zero')
  })

  it('tri-estado: conduce con la habilitación a 1 y se queda mudo sin ella', () => {
    const elements: Element[] = [
      button('data', { x: 0, y: 1 }),
      button('enable', { x: 4, y: 3 }),
      gate('ts', { x: 6, y: 0 }, 'triState1', 2),
      gate('led', { x: 12, y: 1 }, 'led', 1),
      wire('wdata', 2, 2, 6, 2),
      wire('wen', 6, 4, 7, 4),
      wire('wout', 9, 2, 12, 2),
    ]
    // sin habilitar: mudo (off, no zero)
    const simulation = new Simulation()
    simulation.setPowered(true)
    simulation.evaluate(elements)
    simulation.setPressed('data', true)
    expect(simulation.evaluate(elements).devices.get('led')).toBe('off')

    // habilitado con dato 1: conduce
    simulation.setPressed('enable', true)
    expect(simulation.evaluate(elements).devices.get('led')).toBe('one')
  })

  it('reiniciar la corriente devuelve los interruptores a su sitio', () => {
    const elements = twoInput('and')
    const simulation = new Simulation()
    simulation.setPowered(true)
    simulation.evaluate(elements)
    simulation.setPressed('b1', true)
    simulation.setPressed('b2', true)
    expect(simulation.evaluate(elements).devices.get('led')).toBe('one')

    simulation.setPowered(false)
    simulation.setPowered(true)
    simulation.evaluate(elements)
    expect(simulation.evaluate(elements).devices.get('led')).toBe('zero')
  })
})