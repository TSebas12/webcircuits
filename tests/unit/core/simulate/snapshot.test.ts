import { describe, expect, it } from 'vitest'
import { CircuitRunner } from '../../../../src/core/simulate/circuit-runner'
import { devicesSnapshot } from '../../../../src/core/simulate/snapshot'
import { projectIndex } from '../../../../src/core/model/symbol'
import { FunctionButton } from '../../../../src/core/function/devices'
import type { Button, Circuit, Element, Gate, Project, Wire } from '../../../../src/core/model/types'

function gate(
  id: string,
  position: { x: number; y: number },
  gateType: Gate['gateType'],
  inputCount: number,
): Gate {
  return {
    kind: 'gate',
    id,
    circuitId: 'main',
    layerId: 'principal',
    position,
    rotation: 'up',
    gateType,
    inputCount,
    invertedOutput: false,
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

function project(...circuits: readonly Circuit[]): Project {
  return { id: 'p', name: 'P', mainCircuitId: 'main', circuits }
}

/**
 * Arranca un circuito de una hoja y devuelve su foto, que es lo que mira el render.
 *
 * Reproduce los tres pasos del editor —indexar, encender, fotografiar— sin pasar por él.
 */
function snapshotOf(elements: Element[]) {
  const circuit: Circuit = { id: 'main', name: 'Main', elements }
  const index = projectIndex(project(circuit))
  const runner = new CircuitRunner(index, index.circuit('main')!)
  runner.turnOn()
  runner.step(false)
  return {
    devices: devicesSnapshot(index, runner.circuitMap, runner.circuitState!, elements),
    index,
    runner,
    elements,
  }
}

describe('la foto del circuito que se pinta', () => {
  it('un interruptor apagado y su LED son un cero, no «sin señal»', () => {
    const elements: Element[] = [
      button('b1', { x: 0, y: 0 }),
      gate('led', { x: 6, y: 0 }, 'led', 1),
      wire('w1', 2, 1, 6, 1),
    ]

    const { devices } = snapshotOf(elements)

    // El interruptor está en 0 y el LED **recibe** ese 0: los dos están apagados, pero con
    // señal (`zero`), que no es lo mismo que «aquí no llega nada» (`off`).
    expect(devices.get('b1')).toBe('zero')
    expect(devices.get('led')).toBe('zero')
  })

  it('al pulsar el interruptor los dos pasan a uno', () => {
    const elements: Element[] = [
      button('b1', { x: 0, y: 0 }),
      gate('led', { x: 6, y: 0 }, 'led', 1),
      wire('w1', 2, 1, 6, 1),
    ]
    const circuit: Circuit = { id: 'main', name: 'Main', elements }
    const index = projectIndex(project(circuit))
    const runner = new CircuitRunner(index, index.circuit('main')!)
    const state = runner.turnOn()
    runner.step(false)

    const press = state.functions.find((f) => f instanceof FunctionButton)
    if (press === undefined) {
      throw new Error('no hay interruptor en el circuito')
    }
    ;(press as FunctionButton).stateChanged(true)
    runner.step(false)

    const devices = devicesSnapshot(index, runner.circuitMap, state, elements)

    expect(devices.get('b1')).toBe('one')
    expect(devices.get('led')).toBe('one')
  })

  it('lo que no tiene señal queda en `off`, no en cero', () => {
    // Un LED sin nada conectado no lo alimenta nadie: el recorte se queda sin parámetros y no
    // le deja función. No está en 0 —está a la espera—, y eso el dibujo lo distingue.
    const elements: Element[] = [gate('led', { x: 6, y: 0 }, 'led', 1)]

    const { devices } = snapshotOf(elements)

    expect(devices.get('led')).toBe('off')
  })

  it('los cables no tienen foto propia', () => {
    const elements: Element[] = [
      button('b1', { x: 0, y: 0 }),
      gate('led', { x: 6, y: 0 }, 'led', 1),
      wire('w1', 2, 1, 6, 1),
    ]

    const { devices } = snapshotOf(elements)

    // Lo que se pinta es el estado de las puntas a las que toca el cable; el cable no aparece.
    expect([...devices.keys()].sort()).toEqual(['b1', 'led'])
  })

  it('el reloj también deja foto: media vuelta y el LED ya está encendido', () => {
    const elements: Element[] = [
      gate('clk', { x: 0, y: 0 }, 'clock', 0),
      gate('led', { x: 6, y: 0 }, 'led', 1),
      wire('w1', 2, 1, 6, 1),
    ]

    const { devices, index, runner, elements: wires } = snapshotOf(elements)

    // Encender deja un volteo pendiente y la primera vuelta lo gasta: el reloj sale a uno.
    expect(devices.get('clk')).toBe('one')
    expect(devices.get('led')).toBe('one')

    // Medio periodo después, el reloj voltea y la luz se apaga. Es el mismo estado de antes:
    // aquí no se enciende nada nuevo, se le da otra vuelta al mismo circuito. Y ojo: el reloj
    // sale a **cero**, no a «sin señal» —una fuente siempre empuja algo—, y el LED recibe ese
    // cero.
    runner.clockTick()
    runner.step(false)
    const later = devicesSnapshot(index, runner.circuitMap, runner.circuitState!, wires)
    expect(later.get('clk')).toBe('zero')
    expect(later.get('led')).toBe('zero')
  })

  it('un circuito vacío no tiene nada que pintar', () => {
    const { devices } = snapshotOf([])

    expect(devices.size).toBe(0)
  })

  it('una compuerta sin entradas se queda sin señal', () => {
    // La AND tiene salida pero no parámetros: no la alimenta nadie.
    const elements: Element[] = [gate('and1', { x: 0, y: 0 }, 'and', 2)]

    const { devices } = snapshotOf(elements)

    expect(devices.get('and1')).toBe('off')
  })
})
