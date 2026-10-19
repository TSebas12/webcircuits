// @vitest-environment jsdom
//
// El encargado de tener el circuito en marcha, probado sin pasar por el editor: encender,
// pulsar, el reloj y el apagón. El reloj se prueba con temporizadores falsos, que es la única
// forma de verlo latir sin esperar de verdad.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Simulation } from '../../../src/app/simulation'
import { halfPeriod } from '../../../src/core/simulate/circuit-runner'
import type { Button, Element, Gate, Wire } from '../../../src/core/model/types'

/** Los fotogramas que `requestAnimationFrame` deja apuntados, para dispararlos a mano. */
const frames: FrameRequestCallback[] = []

beforeEach(() => {
  vi.useFakeTimers()
  frames.length = 0
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback): number => {
      frames.push(callback)
      return frames.length
    },
    cancelAnimationFrame: (): void => {},
  })
})

/** Ejecuta los fotogramas pendientes, como haría el navegador al pintar. */
function drawFrame(): void {
  const pending = frames.splice(0, frames.length)
  for (const callback of pending) {
    callback(0)
  }
}

function gate(id: string, position: { x: number; y: number }, gateType: Gate['gateType'], inputCount: number): Gate {
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

function ledCircuit(): Element[] {
  return [
    button('b1', { x: 0, y: 0 }),
    gate('led', { x: 6, y: 0 }, 'led', 1),
    wire('w1', 2, 1, 6, 1),
  ]
}

function clockCircuit(): Element[] {
  return [
    gate('clk', { x: 0, y: 0 }, 'clock', 0),
    gate('led', { x: 6, y: 0 }, 'led', 1),
    wire('w1', 2, 1, 6, 1),
  ]
}

describe('tener el circuito en marcha', () => {
  it('arranca apagado: no se simula nada y todo se ve apagado', () => {
    const simulation = new Simulation()
    const state = simulation.evaluate(ledCircuit())

    expect(simulation.powered).toBe(false)
    expect(state.powered).toBe(false)
    expect([...state.devices.values()]).toEqual(['off', 'off'])
  })

  it('encender aplana el circuito y pulsar el interruptor enciende el LED', () => {
    const simulation = new Simulation()
    const elements = ledCircuit()

    simulation.setPowered(true)
    expect(simulation.evaluate(elements).devices.get('led')).toBe('zero')

    simulation.setPressed('b1', true)
    expect(simulation.evaluate(elements).devices.get('led')).toBe('one')
    expect(simulation.isPressed('b1')).toBe(true)

    simulation.setPressed('b1', false)
    expect(simulation.evaluate(elements).devices.get('led')).toBe('zero')
  })

  it('dar corriente otra vez reinicia los interruptores', () => {
    const simulation = new Simulation()
    const elements = ledCircuit()

    simulation.setPowered(true)
    simulation.evaluate(elements)
    simulation.setPressed('b1', true)
    expect(simulation.evaluate(elements).devices.get('led')).toBe('one')

    simulation.setPowered(false)
    simulation.setPowered(true)

    expect(simulation.isPressed('b1')).toBe(false)
    expect(simulation.evaluate(elements).devices.get('led')).toBe('zero')
  })

  it('el reloj late solo y pide que se repinte', () => {
    const refreshes: number[] = []
    const simulation = new Simulation({ onRefresh: () => refreshes.push(frames.length) })
    const elements = clockCircuit()

    simulation.setPowered(true)
    // Encender deja un volteo pendiente: la primera vuelta enciende la luz.
    expect(simulation.evaluate(elements).devices.get('led')).toBe('one')

    // Medio periodo después, el temporizador avisa y el reloj voltea.
    vi.advanceTimersByTime(halfPeriod(100))
    expect(simulation.snapshot.devices.get('led')).toBe('zero')
    // Y ha pedido un repintado, todavía sin dar el fotograma.
    expect(frames.length).toBeGreaterThan(0)

    drawFrame()
    expect(refreshes.length).toBeGreaterThan(0)

    // Otro medio periodo y vuelve a encenderse: el reloj no se queda parado.
    vi.advanceTimersByTime(halfPeriod(100))
    expect(simulation.snapshot.devices.get('led')).toBe('one')
  })

  it('apagar la corriente para el reloj', () => {
    const refreshes: number[] = []
    const simulation = new Simulation({ onRefresh: () => refreshes.push(1) })
    const elements = clockCircuit()

    simulation.setPowered(true)
    simulation.evaluate(elements)
    vi.advanceTimersByTime(halfPeriod(100))
    drawFrame()
    expect(refreshes.length).toBe(1)

    simulation.setPowered(false)
    simulation.evaluate(elements)

    // Con la corriente quitada, por mucho que pase el tiempo no hay nada que latir.
    vi.advanceTimersByTime(halfPeriod(100) * 10)
    drawFrame()
    expect(refreshes.length).toBe(1)
    expect(simulation.snapshot.devices.get('led')).toBe('off')
  })

  it('un circuito que no se puede simular avisa y se queda apagado', () => {
    const errors: string[] = []
    const simulation = new Simulation({ onError: (message) => errors.push(message) })
    // Un LED de siete segmentos: el modelo ya lo entiende, el motor todavía no (M2-12).
    const elements: Element[] = [
      gate('led7', { x: 0, y: 0 }, 'led', 8),
      button('b1', { x: 0, y: 8 }),
      wire('w1', 1, 8, 0, 4),
    ]

    simulation.setPowered(true)
    const state = simulation.evaluate(elements)

    expect(errors).toHaveLength(1)
    expect(simulation.error).toBe(errors[0])
    expect([...state.devices.values()]).toEqual(['off', 'off'])
  })

  it('vaciar el documento olvida los interruptores y el circuito', () => {
    const simulation = new Simulation()
    const elements = ledCircuit()

    simulation.setPowered(true)
    simulation.evaluate(elements)
    simulation.setPressed('b1', true)

    simulation.reset()

    expect(simulation.isPressed('b1')).toBe(false)
  })

  it('la sonda lee el valor del cable (1 encendido, 0 apagado)', () => {
    const simulation = new Simulation()
    const elements = ledCircuit()
    const cable = elements.find((e): e is Wire => e.kind === 'wire')!

    // Apagado no se puede saber.
    expect(simulation.probeValue(cable)).toBeNull()

    simulation.setPowered(true)
    simulation.evaluate(elements)
    expect(simulation.probeValue(cable)).toBe(0)

    simulation.setPressed('b1', true)
    simulation.evaluate(elements)
    expect(simulation.probeValue(cable)).toBe(1)
  })
})
