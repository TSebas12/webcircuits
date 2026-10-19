import { beforeAll, describe, expect, it } from 'vitest'
import { Diagram } from '../../../src/core/model/diagram'
import type { DeviceState } from '../../../src/core/model/types'
import { Camera } from '../../../src/render/camera'
import type { DrawDevice, DrawWire } from '../../../src/render/ir-renderer'
import { buildScene } from '../../../src/render/scene'
import { installFakePath2D } from '../support/canvas'
import { TEST_THEME as THEME } from '../support/theme'

// `buildScene` no dibuja, pero `shapeForGate` viene del registro de siluetas, y su módulo
// se carga igual. El falso no estorba.
beforeAll(() => {
  installFakePath2D()
})

function slice(): Diagram {
  const diagram = new Diagram()
  diagram.addButton({ x: 2, y: 2 }, { isToggle: true })
  diagram.addGate('and', { x: 8, y: 2 }, 2)
  diagram.addGate('led', { x: 14, y: 3 }, 1)
  diagram.addWire({ x: 4, y: 3 }, { x: 8, y: 3 })
  return diagram
}

function sceneOf(
  diagram: Diagram,
  options: {
    states?: ReadonlyMap<string, DeviceState>
    selected?: ReadonlySet<string>
    sketch?: DrawWire[]
    pinDots?: { kind: 'pinDot'; point: { x: number; y: number }; connected: boolean }[]
  } = {},
) {
  return buildScene({
    elements: diagram.elements,
    states: options.states ?? new Map(),
    selected: options.selected ?? new Set(),
    camera: new Camera().state,
    theme: THEME,
    showGrid: true,
    sketch: options.sketch,
    pinDots: options.pinDots,
  })
}

describe('de modelo a piezas de dibujo', () => {
  it('los cables salen primero, para que los símbolos los tapen', () => {
    const items = sceneOf(slice()).items
    const kinds = items.map((item) => item.kind)

    // El único cable del circuito va antes que los tres símbolos.
    expect(kinds).toEqual(['wire', 'device', 'device', 'device'])
  })

  it('el punto de unión sale el primero de todos, por debajo incluso de los cables', () => {
    const diagram = new Diagram()
    // Tres cables que acaban en el mismo punto: eso es una unión de verdad, no un codo.
    diagram.addWire({ x: 5, y: 0 }, { x: 0, y: 0 })
    diagram.addWire({ x: 5, y: 0 }, { x: 9, y: 0 })
    diagram.addWire({ x: 5, y: 0 }, { x: 5, y: 6 })

    const items = sceneOf(diagram).items

    // En el original el remache va en `Z = 0`, así que sale antes que los cables (Z = 1).
    expect(items[0]).toEqual({ kind: 'junction', point: { x: 5, y: 0 } })
    expect(items.filter((item) => item.kind === 'wire')).toHaveLength(3)
  })

  it('dos cables que se encuentran no llevan punto de unión', () => {
    const diagram = new Diagram()
    diagram.addWire({ x: 0, y: 0 }, { x: 5, y: 0 })
    diagram.addWire({ x: 5, y: 0 }, { x: 5, y: 4 })

    expect(sceneOf(diagram).items.some((item) => item.kind === 'junction')).toBe(false)
  })

  it('cada símbolo lleva su tamaño, que es el que manda la geometría del modelo', () => {
    const devices = sceneOf(slice()).items.filter(
      (item): item is DrawDevice => item.kind === 'device',
    )

    const and = devices.find((item) => item.shape === 'and')
    expect([and?.width, and?.height]).toEqual([3, 4])

    const led = devices.find((item) => item.shape === 'led')
    expect([led?.width, led?.height]).toEqual([2, 2])

    const button = devices.find((item) => item.shape === 'button')
    expect([button?.width, button?.height]).toEqual([2, 2])
  })

  it('un dispositivo sin estado conocido se pinta apagado, no encendido por accidente', () => {
    const devices = sceneOf(slice()).items.filter(
      (item): item is DrawDevice => item.kind === 'device',
    )

    expect(devices.every((item) => item.state === 'off')).toBe(true)
  })

  it('el estado de la simulación llega a la pieza que toca', () => {
    const diagram = slice()
    const led = diagram.devices.find(
      (device) => device.kind === 'gate' && device.gateType === 'led',
    )
    expect(led).toBeDefined()
    if (led === undefined) {
      return
    }

    const states = new Map<string, DeviceState>([[led.id, 'one']])
    const devices = sceneOf(diagram, { states }).items.filter(
      (item): item is DrawDevice => item.kind === 'device',
    )

    expect(devices.find((item) => item.shape === 'led')?.state).toBe('one')
    expect(devices.find((item) => item.shape === 'and')?.state).toBe('off')
  })

  it('la selección se marca en la pieza seleccionada y solo en ella', () => {
    const diagram = slice()
    const wire = diagram.elements.find((element) => element.kind === 'wire')
    expect(wire).toBeDefined()
    if (wire === undefined) {
      return
    }

    const items = sceneOf(diagram, { selected: new Set([wire.id]) }).items
    const wires = items.filter((item): item is DrawWire => item.kind === 'wire')

    expect(wires[0]?.selected).toBe(true)
    expect(
      items.filter((item): item is DrawDevice => item.kind === 'device').every((d) => !d.selected),
    ).toBe(true)
  })

  it('los pines y el cable en construcción van los últimos, encima de todo', () => {
    const sketch: DrawWire[] = [
      { kind: 'wire', p1: { x: 0, y: 0 }, p2: { x: 3, y: 3 }, selected: false, signal: 'idle', bus: false },
    ]
    const pinDots = [{ kind: 'pinDot' as const, point: { x: 4, y: 3 }, connected: false }]

    const items = sceneOf(slice(), { sketch, pinDots }).items
    const kinds = items.map((item) => item.kind)

    expect(kinds.at(-1)).toBe('wire')
    expect(kinds.at(-2)).toBe('pinDot')
  })

  it('una compuerta que todavía no sabemos dibujar se ignora en vez de reventar', () => {
    const diagram = new Diagram()
    // Un LED negado: el motor ignora la negación en el LED (`circuit-map.ts`), así que dibujarle
    // una bolita diría algo que el circuito no hace. No se dibuja.
    diagram.addGate('led', { x: 2, y: 2 }, 1, true)

    const items = sceneOf(diagram).items

    // Cargar un circuito con compuertas que aún no se dibujan no puede tumbar la aplicación.
    expect(items).toHaveLength(0)
  })
})
