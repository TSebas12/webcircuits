import { beforeAll, describe, expect, it } from 'vitest'
import { Diagram } from '../../../src/core/model/diagram'
import { circuitInstanceLayout } from '../../../src/core/model/layout'
import type { Circuit, DeviceState } from '../../../src/core/model/types'
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
    resolveCircuit?: (id: string) => Circuit | undefined
  } = {},
) {
  return buildScene({
    elements: diagram.elements,
    states: options.states ?? new Map(),
    selected: options.selected ?? new Set(),
    camera: new Camera().state,
    theme: THEME,
    showGrid: true,
    resolveCircuit: options.resolveCircuit,
    sketch: options.sketch,
    pinDots: options.pinDots,
  })
}

function sceneWithLayers(diagram: Diagram, buses: DrawWire[] = []) {
  return buildScene({
    elements: diagram.elements,
    buses,
    states: new Map(),
    selected: new Set(),
    camera: new Camera().state,
    theme: THEME,
    showGrid: true,
    layers: new Map(
      diagram.layersList.map((layer) => [layer.id, { color: layer.color, opacity: layer.opacity }]),
    ),
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

  it('pines, constantes y repartidores ya tienen silueta y etiqueta', () => {
    const diagram = new Diagram()
    diagram.addPin({ x: 0, y: 0 }, { pinType: 'input', side: 'left', name: 'A' })
    diagram.addConstant({ x: 4, y: 0 }, { bitWidth: 1, value: 1, pinSide: 'right' })
    diagram.addSplitter({ x: 8, y: 0 }, { bitWidth: 4, pinCount: 2 })

    const devices = sceneOf(diagram).items.filter(
      (item): item is DrawDevice => item.kind === 'device',
    )

    expect(devices.find((item) => item.shape === 'pinInput')?.label).toBe('A')
    expect(devices.find((item) => item.shape === 'constant')?.label).toBe('1')
    expect(devices.find((item) => item.shape === 'splitter')).toBeDefined()
  })

  it('un sensor tiene silueta y muestra su notación o su tipo', () => {
    const diagram = new Diagram()
    diagram.addSensor({ x: 0, y: 0 }, { sensorType: 'loop', notation: 'contador' })
    diagram.addSensor({ x: 6, y: 0 })

    const devices = sceneOf(diagram).items.filter(
      (item): item is DrawDevice => item.kind === 'device',
    )

    const labeled = devices.find((item) => item.label === 'contador')
    expect(labeled).toMatchObject({ shape: 'sensor', width: 4, height: 3 })

    // Sin notación, el tipo es lo único que distingue dos sensores en el lienzo.
    expect(devices.find((item) => item.shape === 'sensor' && item.label === 'random')).toBeDefined()
  })

  it('un subcircuito toma su caja y su nombre del circuito que representa', () => {
    const sheet = new Diagram()
    sheet.addPin({ x: 0, y: 0 }, { pinType: 'input', side: 'left' })
    sheet.addPin({ x: 6, y: 0 }, { pinType: 'output', side: 'right' })
    const target: Circuit = { id: 'sub', name: 'Suma', elements: sheet.storedElements }

    const main = new Diagram()
    main.addCircuitInstance({ x: 2, y: 3 }, target.id)
    const resolveCircuit = (id: string): Circuit | undefined =>
      id === target.id ? target : undefined

    const device = sceneOf(main, { resolveCircuit }).items.find(
      (item): item is DrawDevice => item.kind === 'device',
    )
    const size = circuitInstanceLayout(target)

    expect(device).toMatchObject({
      shape: 'circuit',
      width: size.width,
      height: size.height,
      label: 'Suma',
    })
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
      {
        kind: 'wire',
        p1: { x: 0, y: 0 },
        p2: { x: 3, y: 3 },
        selected: false,
        signal: 'idle',
        bus: false,
      },
    ]
    const pinDots = [{ kind: 'pinDot' as const, point: { x: 4, y: 3 }, connected: false }]

    const items = sceneOf(slice(), { sketch, pinDots }).items
    const kinds = items.map((item) => item.kind)

    expect(kinds.at(-1)).toBe('wire')
    expect(kinds.at(-2)).toBe('pinDot')
  })

  it('agrupa por capa y respeta el z-order del panel', () => {
    const diagram = new Diagram()
    const bottom = diagram.layersList[0]
    expect(bottom).toBeDefined()
    if (bottom === undefined) return
    diagram.addGate('and', { x: 0, y: 0 }, 2)

    const top = diagram.createLayer('Superior')
    diagram.activeLayerId = top.id
    diagram.addGate('or', { x: 10, y: 0 }, 2)
    diagram.addWire({ x: 4, y: 2 }, { x: 10, y: 2 })

    const scene = sceneWithLayers(diagram)

    expect(scene.layers.map((layer) => layer.id)).toEqual([bottom.id, top.id])
    expect(scene.layers[0]?.items.filter((item) => item.kind === 'device')).toHaveLength(1)
    expect(scene.layers[1]?.items.map((item) => item.kind)).toEqual(['wire', 'device'])
    // La vista plana conserva el mismo orden que la composición: la capa superior va
    // entera después, incluido su cable, aunque la inferior tenga un símbolo.
    expect(scene.items.map((item) => item.kind)).toEqual(['device', 'wire', 'device'])
    expect(scene.items.filter((item) => item.kind === 'device').map((item) => item.shape)).toEqual([
      'and',
      'or',
    ])
  })

  it('los overlays no entran en ninguna caché de capa', () => {
    const pinDots = [{ kind: 'pinDot' as const, point: { x: 4, y: 3 }, connected: false }]
    const sketch: DrawWire[] = [
      {
        kind: 'wire',
        p1: { x: 0, y: 0 },
        p2: { x: 3, y: 3 },
        selected: false,
        signal: 'idle',
        bus: false,
      },
    ]

    const scene = sceneOf(slice(), { pinDots, sketch })

    expect(scene.overlays.map((item) => item.kind)).toEqual(['pinDot', 'wire'])
    expect(scene.layers.every((layer) => layer.items.every((item) => item.kind !== 'pinDot'))).toBe(
      true,
    )
  })

  it('un bus sintético se queda en la capa que dice, no en la primera', () => {
    const diagram = new Diagram()
    const top = diagram.createLayer('Superior')
    const bus: DrawWire = {
      kind: 'wire',
      p1: { x: 0, y: 0 },
      p2: { x: 5, y: 0 },
      selected: false,
      signal: 'idle',
      bus: true,
      layerId: top.id,
    }

    const scene = sceneWithLayers(diagram, [bus])

    expect(scene.layers).toHaveLength(1)
    expect(scene.layers[0]?.id).toBe(top.id)
    expect(scene.layers[0]?.items).toHaveLength(1)
  })

  it('la unión se calcula por capa: dos cables de capas distintas no son un nudo', () => {
    const diagram = new Diagram()
    diagram.addWire({ x: 0, y: 2 }, { x: 5, y: 2 })
    diagram.addWire({ x: 5, y: 2 }, { x: 5, y: 6 })

    const top = diagram.createLayer('Superior')
    diagram.activeLayerId = top.id
    diagram.addWire({ x: 2, y: 5 }, { x: 5, y: 5 })

    const scene = sceneWithLayers(diagram)

    expect(
      scene.layers.flatMap((layer) => layer.items.filter((item) => item.kind === 'junction')),
    ).toHaveLength(0)
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
