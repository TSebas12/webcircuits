import { describe, expect, it } from 'vitest'
import { CircuitProject, MAIN_CIRCUIT_NAME } from '../../../../src/core/model/circuit'
import { MAIN_CIRCUIT_ID } from '../../../../src/core/model/diagram'

describe('jerarquía de circuitos (M3-01)', () => {
  it('un proyecto nuevo tiene el circuito principal', () => {
    const project = new CircuitProject('mi proyecto')

    expect(project.name).toBe('mi proyecto')
    expect(project.count).toBe(1)
    expect(project.currentCircuitId).toBe(MAIN_CIRCUIT_ID)
    expect(project.current.name).toBe(MAIN_CIRCUIT_NAME)
    expect(project.current.elements).toEqual([])
  })

  it('se pueden crear subcircuitos con nombre', () => {
    const project = new CircuitProject()
    const sub = project.createCircuit({ name: 'Sumador' })

    expect(project.count).toBe(2)
    expect(sub.name).toBe('Sumador')
    expect(project.circuit(sub.id)).toBe(sub)
  })

  it('el nombre por defecto se numera', () => {
    const project = new CircuitProject()
    const a = project.createCircuit()
    const b = project.createCircuit()

    expect(a.name).toBe('Circuit 1')
    expect(b.name).toBe('Circuit 2')
  })

  it('se puede renombrar un circuito', () => {
    const project = new CircuitProject()
    const sub = project.createCircuit()
    project.renameCircuit(sub.id, 'Restador')

    expect(project.circuit(sub.id)?.name).toBe('Restador')
  })

  it('no se puede borrar el circuito principal', () => {
    const project = new CircuitProject()

    expect(project.canDelete(MAIN_CIRCUIT_ID)).toBe(false)
    expect(project.deleteCircuit(MAIN_CIRCUIT_ID)).toBe(false)
    expect(project.count).toBe(1)
  })

  it('borrar un subcircuito lo quita y vuelve al principal si era el actual', () => {
    const project = new CircuitProject()
    const sub = project.createCircuit()
    project.openCircuit(sub.id)
    expect(project.currentCircuitId).toBe(sub.id)

    expect(project.deleteCircuit(sub.id)).toBe(true)
    expect(project.count).toBe(1)
    expect(project.currentCircuitId).toBe(MAIN_CIRCUIT_ID)
  })

  it('abrir un circuito inexistente falla sin cambiar el actual', () => {
    const project = new CircuitProject()

    expect(project.openCircuit('no-existe')).toBe(false)
    expect(project.currentCircuitId).toBe(MAIN_CIRCUIT_ID)
  })

  it('crear y borrar suben la versión', () => {
    const project = new CircuitProject()
    const v0 = project.version
    const sub = project.createCircuit()
    expect(project.version).toBeGreaterThan(v0)
    const v1 = project.version
    project.deleteCircuit(sub.id)
    expect(project.version).toBeGreaterThan(v1)
  })
})