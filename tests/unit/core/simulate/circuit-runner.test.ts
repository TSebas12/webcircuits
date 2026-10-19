import { describe, expect, it } from 'vitest'
import {
  CircuitRunner,
  halfPeriod,
  HISTORY_SIZE,
} from '../../../../src/core/simulate/circuit-runner'
import { projectIndex } from '../../../../src/core/model/symbol'
import { FunctionButton, FunctionLed } from '../../../../src/core/function/devices'
import { State } from '../../../../src/core/function/state'
import type { Circuit, Gate, Project, StoredElement, Wire } from '../../../../src/core/model/types'

function gate(
  id: string,
  circuitId: string,
  position: { x: number; y: number },
  gateType: Gate['gateType'],
  inputCount: number,
): Gate {
  return {
    kind: 'gate',
    id,
    circuitId,
    layerId: 'principal',
    position,
    rotation: 'up',
    gateType,
    inputCount,
    invertedOutput: false,
  }
}

function wire(id: string, circuitId: string, x1: number, y1: number, x2: number, y2: number): Wire {
  return {
    kind: 'wire',
    id,
    circuitId,
    layerId: 'principal',
    p1: { x: x1, y: y1 },
    p2: { x: x2, y: y2 },
    bitWidth: 1,
  }
}

function project(...circuits: readonly Circuit[]): Project {
  return { id: 'p', name: 'P', mainCircuitId: 'main', circuits }
}

/** Un reloj que enciende y apaga un LED: el circuito más simple que **late**. */
function clockAndLed(): Circuit {
  return {
    id: 'main',
    name: 'Main',
    elements: [
      gate('clk', 'main', { x: 0, y: 0 }, 'clock', 0),
      gate('led', 'main', { x: 6, y: 0 }, 'led', 1),
      wire('w1', 'main', 2, 1, 6, 1),
    ] as StoredElement[],
  }
}

/** Un interruptor que enciende y apaga un LED. */
function buttonAndLed(): Circuit {
  return {
    id: 'main',
    name: 'Main',
    elements: [
      {
        kind: 'button',
        id: 'b1',
        circuitId: 'main',
        layerId: 'principal',
        position: { x: 0, y: 0 },
        rotation: 'up',
        isToggle: true,
        inverted: false,
      },
      gate('led', 'main', { x: 6, y: 0 }, 'led', 1),
      wire('w1', 'main', 2, 1, 6, 1),
    ] as StoredElement[],
  }
}

function ledOf(runner: CircuitRunner): FunctionLed {
  const state = runner.circuitState!
  const led = state.functions.find((f) => f instanceof FunctionLed)
  if (led === undefined) {
    throw new Error('no hay LED en el circuito')
  }
  return led as FunctionLed
}

describe('el encendedor del circuito (portado de CircuitRunner.cs)', () => {
  it('medio periodo es 500 entre la frecuencia', () => {
    // Es lo que tarda el reloj en voltear. A 100 Hz, 5 ms.
    expect(halfPeriod(100)).toBe(5)
    expect(HISTORY_SIZE).toBe(100)
  })

  it('encender aplana el circuito y engancha los indicadores', () => {
    const index = projectIndex(project(clockAndLed()))
    const runner = new CircuitRunner(index, index.circuit('main')!)

    expect(runner.isRunning).toBe(false)
    expect(runner.circuitState).toBeNull()

    const state = runner.turnOn()

    expect(runner.isRunning).toBe(true)
    expect(runner.circuitState).toBe(state)
    expect(state.functions.map((f) => f.reportName).sort()).toEqual(['Clock', 'Led'])
    // Todavía no hay probetas (M2-12), así que no hace falta osciloscopio.
    expect(runner.hasProbes).toBe(false)
  })

  it('cada vuelta con reloj pendiente lo voltea, y sin él no cambia nada', () => {
    const index = projectIndex(project(clockAndLed()))
    const runner = new CircuitRunner(index, index.circuit('main')!)
    runner.turnOn()

    // Encender deja un volteo pendiente: la primera vuelta ya cambia la luz.
    expect(runner.step(false)).toBe(true)
    expect(ledOf(runner).get(0)).toBe(State.On1)

    // Sin medios periodos nuevos no hay nada que voltear, y la luz se queda como estaba.
    expect(runner.step(false)).toBe(true)
    expect(ledOf(runner).get(0)).toBe(State.On1)

    // El temporizador avisa de medio periodo: vuelve a voltear.
    runner.clockTick()
    expect(runner.step(false)).toBe(true)
    expect(ledOf(runner).get(0)).toBe(State.On0)
  })

  it('apagar el circuito lo deja apagado aunque el estado siga existiendo', () => {
    const index = projectIndex(project(clockAndLed()))
    const runner = new CircuitRunner(index, index.circuit('main')!)
    runner.turnOn()

    runner.turnOff()

    expect(runner.isRunning).toBe(false)
    // El estado no se tira: se consulta para poder mirar los últimos valores.
    expect(runner.circuitState).not.toBeNull()
    // Y una vuelta con el circuito apagado no evalúa nada: la luz se queda como estaba.
    const last = ledOf(runner).get(0)
    runner.clockTick()
    expect(runner.step(false)).toBe(true)
    expect(ledOf(runner).get(0)).toBe(last)
  })

  it('un interruptor cambia el circuito cuando el usuario lo pulsa', () => {
    const index = projectIndex(project(buttonAndLed()))
    const runner = new CircuitRunner(index, index.circuit('main')!)
    const state = runner.turnOn()

    runner.step(false)
    expect(ledOf(runner).get(0)).toBe(State.On0)

    const button = state.functions.find((f) => f instanceof FunctionButton)
    if (button === undefined) {
      throw new Error('no hay interruptor en el circuito')
    }
    ;(button as FunctionButton).stateChanged(true)

    runner.step(false)
    expect(ledOf(runner).get(0)).toBe(State.On1)
  })

  it('a velocidad máxima se evalúa aunque no haya reloj pendiente', () => {
    // En el original, la velocidad máxima ignora el temporizador y no para de evaluar: es
    // `Evaluate(maxSpeed || flipClock)`.
    const index = projectIndex(project(clockAndLed()))
    const runner = new CircuitRunner(index, index.circuit('main')!)
    runner.turnOn()

    expect(runner.step(true)).toBe(true)
    const first = ledOf(runner).get(0)
    // A velocidad máxima cada vuelta voltea, sin esperar a `clockTick`.
    expect(runner.step(true)).toBe(true)
    expect(ledOf(runner).get(0)).not.toBe(first)
  })
})
