// @vitest-environment jsdom
//
// El encargado de tener el circuito en marcha, probado sin pasar por el editor: encender,
// pulsar, el reloj y el apagón. El reloj se prueba con temporizadores falsos, que es la única
// forma de verlo latir sin esperar de verdad.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Simulation } from '../../../src/app/simulation'
import { halfPeriod } from '../../../src/core/simulate/circuit-runner'
import type { Button, Constant, Element, Gate, Probe, Wire } from '../../../src/core/model/types'

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

function probeCircuit(name = ''): Element[] {
  const probe: Probe = {
    kind: 'probe',
    id: 'probe',
    circuitId: 'main',
    layerId: 'principal',
    position: { x: 6, y: 0 },
    rotation: 'up',
    // El original usa el id como nombre por defecto; la interfaz lo oculta.
    name: name || 'probe',
    pinSide: 'left',
  }
  return [button('b1', { x: 0, y: 0 }), probe, wire('w1', 2, 1, 6, 1)]
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
    const simulation = new Simulation()
    // Un LED de siete segmentos ya se simula como sonda multi-bit.
    const elements: Element[] = [
      gate('led7', { x: 0, y: 0 }, 'led', 8),
      button('b1', { x: 0, y: 8 }),
      wire('w1', 1, 8, 0, 4),
    ]

    simulation.setPowered(true)
    const state = simulation.evaluate(elements)

    expect(simulation.error).toBeNull()
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

  it('una probeta de varios bits enseña un canal por bit', () => {
    const constant: Constant = {
      kind: 'constant',
      id: 'c1',
      circuitId: 'main',
      layerId: 'principal',
      position: { x: 0, y: 0 },
      rotation: 'up',
      bitWidth: 2,
      value: 2,
      pinSide: 'right',
    }
    const probe: Probe = {
      kind: 'probe',
      id: 'probe',
      circuitId: 'main',
      layerId: 'principal',
      position: { x: 6, y: 0 },
      rotation: 'up',
      name: 'probe',
      pinSide: 'left',
    }
    const bus = { ...wire('w1', 2, 1, 6, 1), bitWidth: 2 }
    const simulation = new Simulation()

    simulation.setPowered(true)
    simulation.evaluate([constant, probe, bus])

    const channels = simulation.probeChannels
    expect(channels).toHaveLength(2)
    expect(channels.map((channel) => channel.label)).toEqual(['Sonda 1[0]', 'Sonda 1[1]'])
    expect(channels.map((channel) => channel.samples.at(-1))).toEqual([0, 1])
  })

  it('una probeta con nombre usa ese nombre como etiqueta del canal', () => {
    const simulation = new Simulation()

    simulation.setPowered(true)
    simulation.evaluate(probeCircuit('Entrada A'))

    expect(simulation.probeChannels).toHaveLength(1)
    expect(simulation.probeChannels[0]?.label).toBe('Entrada A')
  })

  it('las probetas alimentan el osciloscopio y se pueden limpiar', () => {
    const simulation = new Simulation()
    const elements = probeCircuit()

    simulation.setPowered(true)
    simulation.evaluate(elements)
    expect(simulation.probeChannels).toHaveLength(1)
    expect(simulation.probeChannels[0]?.label).toBe('Sonda 1')
    expect(simulation.probeChannels[0]?.samples.length).toBeGreaterThan(0)

    // Un paso de reloj graba la muestra nueva; sin reloj la probeta no inventa ticks.
    simulation.setPressed('b1', true)
    simulation.step()
    expect(simulation.probeChannels[0]?.samples.at(-1)).toBe(1)

    simulation.clearProbes()
    expect(simulation.probeChannels[0]?.samples).toEqual([])
  })

  it('pausa y paso a paso', () => {
    const simulation = new Simulation()
    expect(simulation.paused).toBe(false)
    simulation.pause()
    expect(simulation.paused).toBe(true)
    simulation.resume()
    expect(simulation.paused).toBe(false)
    simulation.setFrequency(50)
    expect(simulation.frequencyHz).toBe(50)
    simulation.setFrequency(0)
    expect(simulation.frequencyHz).toBe(100)
    expect(simulation.step()).toBe(false)
  })
})
