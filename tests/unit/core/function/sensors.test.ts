import { describe, expect, it } from 'vitest'
import {
  FunctionSensor,
  saveSeries,
  tryParsePoint,
  tryParseSeries,
} from '../../../../src/core/function/sensors'
import { FunctionProbe } from '../../../../src/core/function/probes'
import { State } from '../../../../src/core/function/state'
import { CircuitState } from '../../../../src/core/simulate/circuit-state'

function stateWithResult(): { state: CircuitState; result: number } {
  const state = new CircuitState(2)
  const result = state.reserveState()
  return { state, result }
}

describe('sensores básicos (M2-12)', () => {
  it('lee y escribe series de puntos', () => {
    expect(tryParseSeries('2:5 4:A 5:E 7:10', 32)).toEqual([
      { tick: 0x2, value: 0x5 },
      { tick: 0x4, value: 0xa },
      { tick: 0x5, value: 0xe },
      { tick: 0x7, value: 0x10 },
    ])
    expect(tryParseSeries('', 32)).toEqual([])
    expect(tryParseSeries('4:1 2:2', 32)).toBeNull()
    expect(tryParsePoint('10:FF', 4)).toEqual({ tick: 0x10, value: 0xf })
    expect(saveSeries([{ tick: 2, value: 5 }, { tick: 4, value: 14 }])).toBe('2:5 4:E')
    expect(saveSeries([])).toBe('')
  })

  it('un sensor manual escribe su valor y avanza una vez', () => {
    const { state, result } = stateWithResult()
    const sensor = new FunctionSensor(state, { sensorType: 'manual', bitWidth: 1, data: '1' }, [result])
    state.endDefinition()

    expect(sensor.flip()).toBe(true)
    expect(sensor.evaluate()).toBe(true)
    expect(state.get(result)).toBe(State.On1)
    expect(sensor.evaluate()).toBe(false)

    sensor.setValue(0)
    expect(sensor.flip()).toBe(true)
    expect(sensor.evaluate()).toBe(true)
    expect(state.get(result)).toBe(State.On0)
  })

  it('una secuencia cuenta y vuelve a cero', () => {
    const { state, result } = stateWithResult()
    const sensor = new FunctionSensor(state, { sensorType: 'sequence', bitWidth: 2, data: '' }, [result])
    state.endDefinition()

    expect(sensor.value).toBe(0)
    sensor.flip()
    expect(sensor.value).toBe(1)
    sensor.flip()
    expect(sensor.value).toBe(2)
    sensor.flip()
    expect(sensor.value).toBe(3)
    sensor.flip()
    expect(sensor.value).toBe(0)
  })

  it('el sensor aleatorio cambia dentro del intervalo, sin incluir el máximo', () => {
    const { state, result } = stateWithResult()
    const mirror = new CircuitState(2)
    const expectedFlip = 10 + mirror.nextRandom(10)
    mirror.nextRandom(4)

    const sensor = new FunctionSensor(
      state,
      { sensorType: 'random', bitWidth: 2, data: 'A:14' },
      [result],
    )
    state.endDefinition()

    let ticks = 0
    while (!sensor.flip()) ticks += 1
    expect(ticks).toBe(expectedFlip)
    expect(sensor.value).toBeLessThan(4)
  })

  it('una serie respeta los ticks y se detiene', () => {
    const { state, result } = stateWithResult()
    const sensor = new FunctionSensor(state, { sensorType: 'series', bitWidth: 4, data: '0:2 2:A' }, [result])
    state.endDefinition()

    expect(sensor.flip()).toBe(true)
    expect(sensor.value).toBe(2)
    expect(sensor.flip()).toBe(false)
    expect(sensor.flip()).toBe(true)
    expect(sensor.value).toBe(0xa)
    expect(sensor.flip()).toBe(false)
  })

  it('una serie en bucle vuelve al principio', () => {
    const { state, result } = stateWithResult()
    const sensor = new FunctionSensor(state, { sensorType: 'loop', bitWidth: 4, data: '0:1 2:2' }, [result])
    state.endDefinition()

    expect(sensor.flip()).toBe(true)
    expect(sensor.value).toBe(1)
    expect(sensor.flip()).toBe(false)
    expect(sensor.flip()).toBe(true)
    expect(sensor.value).toBe(2)
    expect(sensor.flip()).toBe(true)
    expect(sensor.value).toBe(1)
  })

  it('una probeta guarda el estado y su historial', () => {
    const state = new CircuitState(2)
    const parameter = state.reserveState()
    const probe = new FunctionProbe(null, state, [parameter], 4)
    state.endDefinition()
    state.set(parameter, State.On1)

    expect(probe.evaluate()).toBe(false)
    expect(probe.toText()).toBe('1')
    expect(probe.pack()).toBe(2n)
    expect(FunctionProbe.toInt(2n, 1)).toBe(1)
    expect(FunctionProbe.toInt(0n, 1)).toBeNull()
    expect(state.hasProbes).toBe(true)

    probe.tick()
    expect(probe.read(0)).toEqual([State.On1])
    // El historial arranca con la muestra del constructor (todo apagado) y luego la lectura.
    expect(probe.readValues()).toEqual([0n, 2n])

    probe.mark()
    expect(probe.readValues().at(-1)).toBe(-1n)
  })
})
