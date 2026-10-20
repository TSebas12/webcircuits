/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import fixtureXml from '../../../../tests/fixtures/CircuitMapTests.CircuitProject?raw'
import attributeXml from '../../../../tests/fixtures/AttributeConversion.CircuitProject?raw'
import sensorXml from '../../../../tests/fixtures/SensorTests.CircuitProject?raw'
import { importCircuitProject, exportCircuitProject } from '../../../../src/core/persist/circuitproject'
import { CircuitProject } from '../../../../src/core/model/circuit'

describe('circuitproject (M4-07/08)', () => {
  it('importa un fixture sin reventar', () => {
    const project = importCircuitProject(fixtureXml)
    expect(project.count).toBeGreaterThan(0)
    expect(project.circuitsList.length).toBeGreaterThan(0)
  })

  it('exporta XML no vacío', () => {
    const project = importCircuitProject(fixtureXml)
    const out = exportCircuitProject(project)
    expect(out).toContain('<lc:CircuitProject')
    expect(out).toContain('</lc:CircuitProject>')
  })

  it('la probeta viaja en su propia tabla, no como compuerta', () => {
    const project = new CircuitProject('sonda')
    project.current.diagram.addProbe({ x: 2, y: 2 }, { name: 'A', pinSide: 'top' })

    const xml = exportCircuitProject(project)
    expect(xml).toContain('<lc:CircuitProbe')

    const loaded = importCircuitProject(xml)
    const probe = loaded.current.elements.find((element) => element.kind === 'probe')
    expect(probe).toMatchObject({ kind: 'probe', name: 'A', pinSide: 'top' })
  })

  it('el sensor viaja en su propia tabla con todos sus campos', () => {
    const project = new CircuitProject('sensor')
    project.current.diagram.addSensor(
      { x: 2, y: 2 },
      { sensorType: 'keycode', bitWidth: 8, pinSide: 'top', notation: 'tecla', data: '' },
    )

    const xml = exportCircuitProject(project)
    expect(xml).toContain('<lc:Sensor SensorId=')
    expect(xml).toContain('SensorType="KeyCode"')

    const loaded = importCircuitProject(xml)
    const sensor = loaded.current.elements.find((element) => element.kind === 'sensor')
    expect(sensor).toMatchObject({
      kind: 'sensor',
      sensorType: 'keycode',
      bitWidth: 8,
      pinSide: 'top',
      notation: 'tecla',
      data: '',
    })
  })

  it('lee los sensores del fixture del original', () => {
    const project = importCircuitProject(sensorXml)
    const sensors = project.circuitsList
      .flatMap((circuit) => circuit.elements)
      .filter((element) => element.kind === 'sensor')

    expect(sensors).toHaveLength(3)
    const loop = sensors.find(
      (sensor) => sensor.kind === 'sensor' && sensor.sensorType === 'loop' && sensor.bitWidth === 8,
    )
    expect(loop).toMatchObject({ notation: 'loop', pinSide: 'right' })

    // El tercero no trae `SensorType`: el esquema del original dice que es aleatorio.
    const fallback = sensors.find(
      (sensor) => sensor.kind === 'sensor' && sensor.data === '1:1',
    )
    expect(fallback).toMatchObject({ sensorType: 'random', bitWidth: 8, notation: 'loop' })
  })
})

describe('circuitproject: formato de atributos del original (2.0.0.14+)', () => {
  it('lee los pines con su lado, tipo y ancho', () => {
    const project = importCircuitProject(attributeXml)
    const main = project.circuit('main')
    expect(main).toBeDefined()
    const pins = main!.elements.filter((e) => e.kind === 'pin')
    expect(pins).toHaveLength(4)

    const horizontales = pins.filter((p) => p.kind === 'pin' && p.name === 'x')
    expect(horizontales).toHaveLength(1)
    expect(horizontales[0]!.kind === 'pin' && horizontales[0]!.side).toBe('top')

    const salida = pins.find((p) => p.kind === 'pin' && p.name === 'q')
    expect(salida).toBeDefined()
    expect(salida!.kind === 'pin' && salida!.pinType).toBe('output')
    expect(salida!.kind === 'pin' && salida!.side).toBe('right')

    const ancho = pins.find((p) => p.kind === 'pin' && p.name === 'y')
    expect(ancho!.kind === 'pin' && ancho!.bitWidth).toBe(5)
  })

  it('decodifica las compuertas desde su GUID', () => {
    const project = importCircuitProject(attributeXml)
    const gates = project.circuit('main')!.elements.filter((e) => e.kind === 'gate')
    expect(gates).toHaveLength(3)
    const and2 = gates.find((g) => g.kind === 'gate' && g.gateType === 'and' && g.inputCount === 2)
    expect(and2).toBeDefined()
    const and3 = gates.find((g) => g.kind === 'gate' && g.inputCount === 3)
    expect(and3!.kind === 'gate' && and3!.invertedOutput).toBe(true)
  })

  it('deja el subcircuito apuntando a un circuito que existe', () => {
    const project = importCircuitProject(attributeXml)
    const host = project.circuitsList.find((c) =>
      c.elements.some((e) => e.kind === 'circuit'),
    )
    expect(host).toBeDefined()
    const instance = host!.elements.find((e) => e.kind === 'circuit')
    expect(instance!.kind === 'circuit' && project.circuit(instance!.targetCircuitId)).toBeDefined()
  })
})

describe('circuitproject: ida y vuelta', () => {
  it('conserva el giro y el interruptor', () => {
    const p = new CircuitProject('rt')
    const gate = p.current.diagram.addGate('and', { x: 4, y: 4 }, 2)
    p.current.diagram.rotate(gate.id, true)
    p.current.diagram.addButton({ x: 0, y: 0 }, { isToggle: true, inverted: true })

    const loaded = importCircuitProject(exportCircuitProject(p))
    const gate2 = loaded.circuit('main')!.elements.find((e) => e.kind === 'gate')
    expect(gate2!.kind === 'gate' && gate2!.rotation).toBe('right')

    const button = loaded.circuit('main')!.elements.find((e) => e.kind === 'button')
    expect(button).toBeDefined()
    expect(button!.kind === 'button' && button!.isToggle).toBe(true)
    expect(button!.kind === 'button' && button!.inverted).toBe(true)
  })

  it('conserva pines, constantes y repartidores', () => {
    const p = new CircuitProject('rt2')
    p.current.diagram.addPin({ x: 0, y: 0 }, { side: 'top', pinType: 'output', bitWidth: 4 })
    p.current.diagram.addConstant({ x: 4, y: 0 }, { bitWidth: 3, value: 5, pinSide: 'left' })
    p.current.diagram.addSplitter({ x: 8, y: 0 }, { bitWidth: 4, pinCount: 3, clockwise: false })

    const loaded = importCircuitProject(exportCircuitProject(p))
    const elements = loaded.circuit('main')!.elements

    const pin = elements.find((e) => e.kind === 'pin')
    expect(pin!.kind === 'pin' && pin!.side).toBe('top')
    expect(pin!.kind === 'pin' && pin!.pinType).toBe('output')
    expect(pin!.kind === 'pin' && pin!.bitWidth).toBe(4)

    const constant = elements.find((e) => e.kind === 'constant')
    expect(constant!.kind === 'constant' && constant!.value).toBe(5)
    expect(constant!.kind === 'constant' && constant!.bitWidth).toBe(3)
    expect(constant!.kind === 'constant' && constant!.pinSide).toBe('left')

    const splitter = elements.find((e) => e.kind === 'splitter')
    expect(splitter!.kind === 'splitter' && splitter!.pinCount).toBe(3)
    expect(splitter!.kind === 'splitter' && splitter!.clockwise).toBe(false)
  })

  it('conserva la jerarquía de subcircuitos', () => {
    const p = new CircuitProject('rt3')
    const sub = p.createCircuit({ name: 'Sub' })
    sub.diagram.addPin({ x: 0, y: 0 })
    p.current.diagram.addCircuitInstance({ x: 2, y: 2 }, sub.id)

    const loaded = importCircuitProject(exportCircuitProject(p))
    const instance = loaded.circuit('main')!.elements.find((e) => e.kind === 'circuit')
    expect(instance).toBeDefined()
    if (instance?.kind !== 'circuit') throw new Error('no es una instancia')
    expect(loaded.circuit(instance.targetCircuitId)).toBeDefined()
    expect(loaded.circuit(instance.targetCircuitId)!.elements.some((e) => e.kind === 'pin')).toBe(true)
  })
})