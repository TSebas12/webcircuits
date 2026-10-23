import { describe, expect, it } from 'vitest'
import { CircuitProject } from '../../../../src/core/model/circuit'
import {
  ComponentExportError,
  collectComponentCircuits,
  createComponentFromProject,
  exportComponent,
} from '../../../../src/core/persist/component-export'
import { parseComponent } from '../../../../src/core/persist/component-format'

function projectWithDependencies(): {
  readonly project: CircuitProject
  readonly root: ReturnType<CircuitProject['createCircuit']>
  readonly half: ReturnType<CircuitProject['createCircuit']>
  readonly unused: ReturnType<CircuitProject['createCircuit']>
} {
  const project = new CircuitProject('Proyecto')
  const root = project.createCircuit({ name: 'Sumador' })
  const half = project.createCircuit({ name: 'Semisumador' })
  const unused = project.createCircuit({ name: 'No usado' })
  root.diagram.addCircuitInstance({ x: 2, y: 2 }, half.id)
  return { project, root, half, unused }
}

describe('exportar un subcircuito como componente (M4C-02)', () => {
  it('empaqueta el raíz y sus dependencias, y deja fuera el resto del proyecto', () => {
    const { project, root, half, unused } = projectWithDependencies()
    const component = createComponentFromProject(project, {
      rootCircuitId: root.id,
      metadata: {
        name: 'Sumador compartido',
        description: 'Dos semisumadores',
        author: 'Pruebas',
        createdAt: '2026-10-22T00:00:00.000Z',
        tags: ['suma'],
      },
    })

    expect(component.rootCircuitId).toBe(root.id)
    expect(component.circuits.map((circuit) => circuit.id)).toEqual([root.id, half.id])
    expect(component.circuits.some((circuit) => circuit.id === unused.id)).toBe(false)
    expect(component.circuits.some((circuit) => circuit.id === 'main')).toBe(false)
    expect(component.metadata.name).toBe('Sumador compartido')
  })

  it('el texto exportado se puede volver a leer con el validador de componentes', () => {
    const { project, root } = projectWithDependencies()
    const text = exportComponent(project, {
      rootCircuitId: root.id,
      metadata: { createdAt: '2026-10-22T00:00:00.000Z' },
    })
    const loaded = parseComponent(text)

    expect(loaded.rootCircuitId).toBe(root.id)
    // Sin nombre explícito, el componente hereda el del circuito raíz.
    expect(loaded.metadata.name).toBe('Sumador')
    expect(loaded.metadata.description).toBe('')
    expect(loaded.circuits).toHaveLength(2)
  })

  it('un lazo entre subcircuitos no se recorre para siempre', () => {
    const { project, root, half } = projectWithDependencies()
    half.diagram.addCircuitInstance({ x: 6, y: 2 }, root.id)

    const circuits = collectComponentCircuits(project, root.id)
    expect(circuits.map((circuit) => circuit.id)).toEqual([root.id, half.id])
  })

  it('se niega a exportar un componente con un lazo de subcircuitos', () => {
    const { project, root, half } = projectWithDependencies()
    half.diagram.addCircuitInstance({ x: 6, y: 2 }, root.id)

    expect(() => createComponentFromProject(project, { rootCircuitId: root.id })).toThrowError(
      /lazo de subcircuitos/,
    )
    try {
      createComponentFromProject(project, { rootCircuitId: root.id })
    } catch (error) {
      expect(error).toMatchObject({ code: 'circular-dependency' })
    }
  })

  it('avisa si falta el raíz o una dependencia', () => {
    const { project, root } = projectWithDependencies()
    expect(() => collectComponentCircuits(project, 'no-existe')).toThrowError(
      ComponentExportError,
    )
    try {
      collectComponentCircuits(project, 'no-existe')
    } catch (error) {
      expect(error).toMatchObject({ code: 'missing-root' })
    }

    root.diagram.addCircuitInstance({ x: 8, y: 2 }, 'circuito-perdido')
    try {
      collectComponentCircuits(project, root.id)
    } catch (error) {
      expect(error).toMatchObject({ code: 'missing-dependency' })
    }
  })
})
