import { describe, expect, it } from 'vitest'
import { CircuitProject } from '../../../../src/core/model/circuit'
import { exportComponent } from '../../../../src/core/persist/component-export'
import { parseComponent, type SerializedComponent } from '../../../../src/core/persist/component-format'
import {
  ComponentImportError,
  importComponent,
} from '../../../../src/core/persist/component-import'

function sourceComponent(): { readonly text: string; readonly rootId: string; readonly halfId: string } {
  const project = new CircuitProject('Origen')
  const root = project.createCircuit({ name: 'Sumador' })
  const half = project.createCircuit({ name: 'Semisumador' })
  root.diagram.addCircuitInstance({ x: 2, y: 2 }, half.id)
  half.diagram.addWire({ x: 0, y: 0 }, { x: 4, y: 0 })
  return {
    text: exportComponent(project, {
      rootCircuitId: root.id,
      metadata: { name: 'Sumador', createdAt: '2026-10-22T00:00:00.000Z' },
    }),
    rootId: root.id,
    halfId: half.id,
  }
}

function brokenComponent(): SerializedComponent {
  return parseComponent(
    JSON.stringify({
      format: 'webcircuits-component',
      version: 1,
      kind: 'component',
      metadata: { name: 'Roto' },
      rootCircuitId: 'root',
      circuits: [
        {
          id: 'root',
          name: 'Roto',
          elements: [{ kind: 'circuit', targetCircuitId: 'no-existe' }],
        },
      ],
    }),
  )
}

describe('importar un componente (M4C-03)', () => {
  it('añade el raíz y sus dependencias con ids nuevos y reescribe las referencias', () => {
    const source = sourceComponent()
    const target = new CircuitProject('Destino')
    const existing = target.createCircuit({ name: 'Existente' })
    const before = target.circuitsList.length

    const imported = importComponent(target, parseComponent(source.text))

    expect(target.circuitsList).toHaveLength(before + 2)
    expect(imported.rootCircuitId).not.toBe(source.rootId)
    expect(imported.circuitIds).toContain(imported.rootCircuitId)
    expect(target.circuit(existing.id)?.name).toBe('Existente')

    const root = target.circuit(imported.rootCircuitId)
    expect(root?.name).toBe('Sumador')
    const instance = root?.diagram.storedElements.find((element) => element.kind === 'circuit')
    expect(instance?.kind).toBe('circuit')
    if (instance?.kind === 'circuit') {
      expect(target.circuit(instance.targetCircuitId)?.name).toBe('Semisumador')
      expect(instance.targetCircuitId).not.toBe(source.halfId)
    }
  })

  it('se puede importar dos veces sin que los circuitos choquen', () => {
    const source = sourceComponent()
    const target = new CircuitProject('Destino')
    const component = parseComponent(source.text)

    const first = importComponent(target, component)
    const second = importComponent(target, component)

    expect(first.rootCircuitId).not.toBe(second.rootCircuitId)
    expect(new Set([...first.circuitIds, ...second.circuitIds]).size).toBe(4)
    expect(target.circuitsList).toHaveLength(5)
  })

  it('rechaza una dependencia que no viaja en el paquete sin tocar el proyecto', () => {
    const target = new CircuitProject('Destino')
    const before = target.circuitsList.length

    expect(() => importComponent(target, brokenComponent())).toThrowError(
      ComponentImportError,
    )
    expect(() =>
      importComponent(target, {
        ...brokenComponent(),
        circuits: [
          {
            id: 'root',
            name: 'Roto',
            elements: [{ kind: 'unknown' }],
          },
        ],
      }),
    ).toThrow()
    expect(target.circuitsList).toHaveLength(before)
  })

  it('si falla al rellenar, deshace los circuitos recién creados', () => {
    const target = new CircuitProject('Destino')
    const before = target.circuitsList.length
    const broken = {
      ...brokenComponent(),
      circuits: [
        {
          id: 'root',
          name: 'Roto',
          elements: [{ kind: 'unknown' }],
        },
      ],
    }

    expect(() => importComponent(target, broken)).toThrow()
    expect(target.circuitsList).toHaveLength(before)
  })
})
