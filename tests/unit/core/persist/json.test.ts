import { describe, expect, it } from 'vitest'
import { CircuitProject } from '../../../../src/core/model/circuit'
import { serializeProject, deserializeProject } from '../../../../src/core/persist/json'

describe('json persist (M4-05/06)', () => {
  it('ida y vuelta conserva elementos', () => {
    const p = new CircuitProject('prueba')
    const d = p.current.diagram
    d.addGate('and', { x: 2, y: 2 }, 2)
    d.addButton({ x: 0, y: 0 }, { isToggle: true })
    d.addWire({ x: 4, y: 3 }, { x: 8, y: 3 }, 2)

    const json = serializeProject(p)
    const p2 = deserializeProject(json)
    expect(p2.name).toBe('prueba')
    expect(p2.current.elements.length).toBe(3)
  })

  it('rechaza formato desconocido', () => {
    expect(() => deserializeProject(JSON.stringify({ format: 'foo', version: 1, name: 'x', currentCircuitId: 'main', circuits: [] }))).toThrow()
  })

  it('rechaza versión no soportada', () => {
    expect(() => deserializeProject(JSON.stringify({ format: 'webcircuits', version: 99, name: 'x', currentCircuitId: 'main', circuits: [] }))).toThrow()
  })

  it('conserva los pines con el lado en minúscula', () => {
    const p = new CircuitProject('pines')
    p.current.diagram.addPin({ x: 1, y: 1 }, { side: 'top', pinType: 'output', bitWidth: 4 })
    const pin = deserializeProject(serializeProject(p)).current.elements.find((e) => e.kind === 'pin')
    expect(pin).toBeDefined()
    expect(pin!.kind === 'pin' && pin!.side).toBe('top')
    expect(pin!.kind === 'pin' && pin!.pinType).toBe('output')
    expect(pin!.kind === 'pin' && pin!.bitWidth).toBe(4)
  })

  it('remapea el `targetCircuitId` de los subcircuitos al cargar', () => {
    const p = new CircuitProject('jerarquia')
    const sub = p.createCircuit({ name: 'Sub' })
    sub.diagram.addPin({ x: 0, y: 0 })
    p.current.diagram.addCircuitInstance({ x: 2, y: 2 }, sub.id)

    // Se falsea el id del subcircuito a uno que no se generaría al cargar, para comprobar de
    // verdad que se reescribe y no que coinciden por casualidad.
    const json = serializeProject(p).replaceAll(sub.id, 'sub-original')
    const loaded = deserializeProject(json)
    const instance = loaded.current.elements.find((e) => e.kind === 'circuit')
    expect(instance).toBeDefined()
    if (instance?.kind !== 'circuit') {
      throw new Error('no es una instancia')
    }
    expect(instance.targetCircuitId).not.toBe('sub-original')
    expect(loaded.circuit(instance.targetCircuitId)).toBeDefined()
  })

  it('conserva el color propio de un cable (M6-14)', () => {
    const p = new CircuitProject('colores')
    const wire = p.current.diagram.addWire({ x: 0, y: 0 }, { x: 4, y: 0 })
    p.current.diagram.setWireColor(wire.id, '#123456')

    const json = serializeProject(p)
    expect(json).toContain('#123456')

    const loaded = deserializeProject(json)
    const back = loaded.current.elements.find((e) => e.kind === 'wire')
    expect(back?.kind === 'wire' && back.color).toBe('#123456')
  })

  it('no escribe `color` si el cable no tiene uno propio', () => {
    const p = new CircuitProject('sin-color')
    p.current.diagram.addWire({ x: 0, y: 0 }, { x: 4, y: 0 })
    const loaded = deserializeProject(serializeProject(p))
    const wire = loaded.current.elements.find((e) => e.kind === 'wire')
    expect(wire?.kind === 'wire' && wire.color).toBeUndefined()
  })

  it('una pieza nueva tras cargar no pisa un id importado', () => {
    const p = new CircuitProject('ids')
    p.current.diagram.addGate('and', { x: 0, y: 0 }, 2)
    p.current.diagram.addGate('and', { x: 4, y: 0 }, 2)

    const loaded = deserializeProject(serializeProject(p))
    const created = loaded.current.diagram.addGate('and', { x: 8, y: 0 })
    expect(loaded.current.elements.filter((e) => e.id === created.id)).toHaveLength(1)
  })
})