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
})