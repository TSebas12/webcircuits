import { describe, expect, it } from 'vitest'
import {
  createComponentDocument,
  type SerializedComponent,
} from '../../../../src/core/persist/component-format'
import { inspectComponentDependencies } from '../../../../src/core/persist/component-dependencies'
import type { SerializedCircuit } from '../../../../src/core/persist/json'

function circuit(id: string, targets: readonly string[]): SerializedCircuit {
  return {
    id,
    name: id,
    elements: targets.map((target) => ({ kind: 'circuit', targetCircuitId: target })),
  }
}

function component(
  circuits: readonly SerializedCircuit[],
  rootCircuitId = circuits[0]?.id ?? 'root',
): SerializedComponent {
  return createComponentDocument({
    metadata: {
      name: 'Prueba',
      description: '',
      author: '',
      createdAt: '2026-10-22T00:00:00.000Z',
      tags: [],
    },
    rootCircuitId,
    circuits,
  })
}

describe('dependencias de componentes (M4C-05)', () => {
  it('acepta un árbol con dependencias completas', () => {
    const report = inspectComponentDependencies(
      component([circuit('a', ['b']), circuit('b', ['c']), circuit('c', [])]),
    )

    expect(report).toEqual({ missing: [], cycles: [], ok: true })
  })

  it('detecta una instancia que apunta a un circuito ausente', () => {
    const report = inspectComponentDependencies(
      component([circuit('a', ['b', 'fantasma']), circuit('b', [])]),
    )

    expect(report.ok).toBe(false)
    expect(report.missing).toEqual([
      { circuitId: 'a', targetCircuitId: 'fantasma' },
    ])
  })

  it('detecta un circuito que se usa a sí mismo', () => {
    const report = inspectComponentDependencies(component([circuit('a', ['a'])]))

    expect(report.ok).toBe(false)
    expect(report.cycles).toEqual([{ circuitIds: ['a', 'a'] }])
  })

  it('detecta un lazo entre dos circuitos', () => {
    const report = inspectComponentDependencies(
      component([circuit('a', ['b']), circuit('b', ['a'])]),
    )

    expect(report.ok).toBe(false)
    expect(report.cycles).toHaveLength(1)
    expect(report.cycles[0]?.circuitIds).toEqual(['a', 'b', 'a'])
  })

  it('no repite el mismo lazo al recorrerlo desde otro nodo', () => {
    const report = inspectComponentDependencies(
      component([circuit('a', ['b']), circuit('b', ['c']), circuit('c', ['a'])]),
    )

    expect(report.cycles).toHaveLength(1)
    expect(report.cycles[0]?.circuitIds).toEqual(['a', 'b', 'c', 'a'])
  })
})
