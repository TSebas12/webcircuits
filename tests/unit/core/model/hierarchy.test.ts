import { describe, expect, it } from 'vitest'
import { CircuitProject } from '../../../../src/core/model/circuit'
import { MAIN_CIRCUIT_ID } from '../../../../src/core/model/diagram'

describe('jerarquía de circuitos (M3-11)', () => {
  it('se puede crear y abrir un subcircuito', () => {
    const project = new CircuitProject()
    const sub = project.createCircuit({ name: 'Sumador' })
    expect(project.openCircuit(sub.id)).toBe(true)
    expect(project.currentCircuitId).toBe(sub.id)
    expect(project.current.name).toBe('Sumador')
  })

  it('volver al principal restaura el circuito', () => {
    const project = new CircuitProject()
    const sub = project.createCircuit()
    project.openCircuit(sub.id)
    project.openCircuit(MAIN_CIRCUIT_ID)
    expect(project.currentCircuitId).toBe(MAIN_CIRCUIT_ID)
  })

  it('borrar el circuito actual vuelve al principal', () => {
    const project = new CircuitProject()
    const sub = project.createCircuit()
    project.openCircuit(sub.id)
    expect(project.deleteCircuit(sub.id)).toBe(true)
    expect(project.currentCircuitId).toBe(MAIN_CIRCUIT_ID)
  })

  it('no se puede borrar el principal', () => {
    const project = new CircuitProject()
    expect(project.deleteCircuit(MAIN_CIRCUIT_ID)).toBe(false)
    expect(project.count).toBe(1)
  })

  it('la versión sube al crear y borrar', () => {
    const project = new CircuitProject()
    const v0 = project.version
    const sub = project.createCircuit()
    expect(project.version).toBeGreaterThan(v0)
    const v1 = project.version
    project.deleteCircuit(sub.id)
    expect(project.version).toBeGreaterThan(v1)
  })
})