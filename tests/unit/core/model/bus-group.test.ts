import { describe, expect, it } from 'vitest'
import { Diagram } from '../../../../src/core/model/diagram'

describe('bus groups en el documento (M3B-01)', () => {
  it('crea el grupo, lo deshace y lo rehace sin tocar los cables', () => {
    const diagram = new Diagram()
    const a = diagram.addWire({ x: 0, y: 2 }, { x: 10, y: 2 })
    const b = diagram.addWire({ x: 0, y: 4 }, { x: 10, y: 4 })

    const group = diagram.addBusGroup([a.id, b.id], { name: 'Datos' })
    expect(group).not.toBeNull()
    expect(diagram.busGroups).toHaveLength(1)
    expect(diagram.busGroupForWire(b.id)?.name).toBe('Datos')
    expect(diagram.storedElements).toHaveLength(2)

    expect(diagram.undo()).toBe(true)
    expect(diagram.busGroups).toHaveLength(0)
    expect(diagram.get(a.id)?.kind).toBe('wire')

    expect(diagram.redo()).toBe(true)
    expect(diagram.busGroups).toHaveLength(1)
  })

  it('rechaza miembros repetidos, de distinta capa o ya agrupados', () => {
    const diagram = new Diagram()
    const a = diagram.addWire({ x: 0, y: 2 }, { x: 10, y: 2 })
    const b = diagram.addWire({ x: 0, y: 4 }, { x: 10, y: 4 })
    const other = diagram.createLayer('Otra')
    diagram.moveElementToLayer(b.id, other.id)

    expect(diagram.addBusGroup([a.id, a.id])).toBeNull()
    expect(diagram.addBusGroup([a.id, b.id])).toBeNull()

    diagram.moveElementToLayer(b.id, 'principal')
    expect(diagram.addBusGroup([a.id, b.id])).not.toBeNull()
    expect(diagram.addBusGroup([a.id, b.id])).toBeNull()
  })

  it('se disuelve si desaparece uno de sus cables', () => {
    const diagram = new Diagram()
    const a = diagram.addWire({ x: 0, y: 2 }, { x: 10, y: 2 })
    const b = diagram.addWire({ x: 0, y: 4 }, { x: 10, y: 4 })
    diagram.addBusGroup([a.id, b.id])

    diagram.remove(a.id)
    expect(diagram.busGroups).toHaveLength(0)
    expect(diagram.get(b.id)?.kind).toBe('wire')
  })

  it('mover un miembro de capa arrastra el bus completo', () => {
    const diagram = new Diagram()
    const a = diagram.addWire({ x: 0, y: 2 }, { x: 10, y: 2 })
    const b = diagram.addWire({ x: 0, y: 4 }, { x: 10, y: 4 })
    const group = diagram.addBusGroup([a.id, b.id])
    const layer = diagram.createLayer('Otra')
    if (group === null) return

    diagram.moveElementToLayer(a.id, layer.id)

    expect(diagram.busGroups[0]?.layerId).toBe(layer.id)
    expect(diagram.get(a.id)?.layerId).toBe(layer.id)
    expect(diagram.get(b.id)?.layerId).toBe(layer.id)
  })

  it('cargar grupos filtra los que apuntan a cables que no existen', () => {
    const diagram = new Diagram()
    const a = diagram.addWire({ x: 0, y: 2 }, { x: 10, y: 2 })
    const b = diagram.addWire({ x: 0, y: 4 }, { x: 10, y: 4 })

    diagram.setBusGroups([
      {
        kind: 'busGroup',
        id: 'bus-9',
        circuitId: 'main',
        layerId: 'principal',
        wireIds: [a.id, b.id],
        collapsed: true,
        name: 'Bueno',
      },
      {
        kind: 'busGroup',
        id: 'bus-10',
        circuitId: 'main',
        layerId: 'principal',
        wireIds: [a.id, 'wire-inexistente'],
        collapsed: true,
        name: 'Roto',
      },
    ])

    expect(diagram.busGroups).toHaveLength(1)
    expect(diagram.busGroups[0]?.name).toBe('Bueno')
  })
})
