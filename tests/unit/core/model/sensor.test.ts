/**
 * El sensor como pieza del modelo (M2-12).
 *
 * El motor ya tenía sus tipos (`core/function/sensors.ts`); lo que faltaba era que el
 * documento supiera colocarlo, medirlo y darle una salida. Estas pruebas fijan justo eso:
 * los ocho tipos, sus datos por defecto y la geometría de 4×3 con una sola salida.
 */

import { describe, expect, it } from 'vitest'
import { Diagram } from '../../../../src/core/model/diagram'
import { deviceLayout } from '../../../../src/core/model/layout'
import {
  DEFAULT_RANDOM_DATA,
  DEFAULT_SERIES_DATA,
  SENSOR_TYPES,
  defaultSensorData,
  isSensorType,
} from '../../../../src/core/model/sensor'

describe('sensor como pieza (M2-12)', () => {
  it('conoce los ocho tipos del original', () => {
    expect(SENSOR_TYPES).toEqual([
      'series',
      'loop',
      'random',
      'manual',
      'keycode',
      'ascii',
      'sequence',
      'clock',
    ])
    expect(isSensorType('random')).toBe(true)
    expect(isSensorType('keycode')).toBe(true)
    expect(isSensorType('otro')).toBe(false)
  })

  it('cada tipo nace con los datos que le corresponden', () => {
    expect(defaultSensorData('series')).toBe(DEFAULT_SERIES_DATA)
    expect(defaultSensorData('loop')).toBe(DEFAULT_SERIES_DATA)
    expect(defaultSensorData('random')).toBe(DEFAULT_RANDOM_DATA)
    expect(defaultSensorData('manual')).toBe('')
    expect(defaultSensorData('clock')).toBe('')
  })

  it('se coloca como un sensor aleatorio de 1 bit, igual que el original', () => {
    const diagram = new Diagram()
    const sensor = diagram.addSensor({ x: 2, y: 2 })

    expect(sensor).toMatchObject({
      kind: 'sensor',
      sensorType: 'random',
      bitWidth: 1,
      pinSide: 'right',
      notation: '',
      data: DEFAULT_RANDOM_DATA,
    })
    // Ya es un dispositivo dibujable: el lienzo y el hit-test lo ven.
    expect(diagram.devices.map((device) => device.id)).toContain(sensor.id)
  })

  it('acepta tipo, ancho, lado, notación y datos al colocarlo', () => {
    const diagram = new Diagram()
    const sensor = diagram.addSensor(
      { x: 4, y: 1 },
      { sensorType: 'loop', bitWidth: 4, pinSide: 'left', notation: 'contador', data: '0:1 2:2' },
    )

    expect(sensor).toMatchObject({
      sensorType: 'loop',
      bitWidth: 4,
      pinSide: 'left',
      notation: 'contador',
      data: '0:1 2:2',
    })
  })

  it('un tipo desconocido cae en aleatorio en vez de romper la simulación', () => {
    const diagram = new Diagram()
    const sensor = diagram.addSensor({ x: 0, y: 0 }, { sensorType: 'inventado' })

    expect(sensor.sensorType).toBe('random')
    expect(sensor.data).toBe(DEFAULT_RANDOM_DATA)
  })

  it('mide 4×3 y tiene una única salida del ancho pedido', () => {
    const diagram = new Diagram()
    const sensor = diagram.addSensor(
      { x: 0, y: 0 },
      { bitWidth: 5, pinSide: 'left', sensorType: 'manual', data: '1F' },
    )
    const layout = deviceLayout(sensor)

    expect([layout.width, layout.height]).toEqual([4, 3])
    expect(layout.pins).toHaveLength(1)
    expect(layout.pins[0]).toMatchObject({
      side: 'left',
      type: 'output',
      bitWidth: 5,
      inverted: false,
      point: { x: 0, y: 1 },
    })
  })
})
