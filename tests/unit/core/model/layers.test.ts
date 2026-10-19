import { describe, expect, it } from 'vitest'
import { Diagram } from '../../../../src/core/model/diagram'
import { DEFAULT_LAYER_ID } from '../../../../src/core/model/types'

describe('layers', () => {
  it('default layer exists', () => {
    const d = new Diagram()
    expect(d.layersList).toHaveLength(1)
    expect(d.layersList[0]!.id).toBe(DEFAULT_LAYER_ID)
  })
  it('create/rename/delete', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    expect(d.layersList).toHaveLength(2)
    d.renameLayer(l.id, 'Renamed')
    expect(d.layersList.find((x) => x.id === l.id)!.name).toBe('Renamed')
    expect(d.deleteLayer(l.id)).toBe(true)
    expect(d.layersList).toHaveLength(1)
    expect(d.deleteLayer(DEFAULT_LAYER_ID)).toBe(false)
  })
  it('visibility filters elements', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    const g = d.addGate('and', { x: 0, y: 0 }, 2)
    d.moveElementToLayer(g.id, l.id)
    d.setLayerVisible(l.id, false)
    expect(d.visibleElements).toHaveLength(0)
    d.setLayerVisible(l.id, true)
    expect(d.visibleElements).toHaveLength(1)
  })
  it('lock prevents? model only', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    expect(d.isLayerLocked(l.id)).toBe(false)
    d.setLayerLocked(l.id, true)
    expect(d.isLayerLocked(l.id)).toBe(true)
  })
  it('duplicate layer', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    const g = d.addGate('and', { x: 0, y: 0 }, 2)
    d.moveElementToLayer(g.id, l.id)
    const dup = d.duplicateLayer(l.id)
    expect(dup).not.toBeNull()
    expect(d.layersList).toHaveLength(3)
    const els = d.elements.filter((e) => e.layerId === dup!.id)
    expect(els).toHaveLength(1)
  })
  it('merge layer', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    const g = d.addGate('and', { x: 0, y: 0 }, 2)
    d.moveElementToLayer(g.id, l.id)
    expect(d.mergeLayer(l.id, DEFAULT_LAYER_ID)).toBe(true)
    expect(d.layersList).toHaveLength(1)
    expect(d.elements[0]!.layerId).toBe(DEFAULT_LAYER_ID)
  })

  // M5-19 se cumplía a medias: las fotos de deshacer no llevaban las capas, así que
  // deshacer una operación de capas no restauraba nada. Estas pruebas lo fijan.

  it('deshacer restaura las capas creadas', () => {
    const d = new Diagram()
    d.createLayer('L2')
    expect(d.layersList).toHaveLength(2)
    d.undo()
    expect(d.layersList).toHaveLength(1)
    d.redo()
    expect(d.layersList).toHaveLength(2)
  })

  it('deshacer restaura el nombre de una capa', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    d.renameLayer(l.id, 'Renombrada')
    expect(d.layersList.find((x) => x.id === l.id)!.name).toBe('Renombrada')
    d.undo()
    expect(d.layersList.find((x) => x.id === l.id)!.name).toBe('L2')
  })

  it('deshacer restaura la visibilidad de una capa', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    d.setLayerVisible(l.id, false)
    expect(d.layersList.find((x) => x.id === l.id)!.visible).toBe(false)
    d.undo()
    expect(d.layersList.find((x) => x.id === l.id)!.visible).toBe(true)
  })

  it('los identificadores de capa no se reutilizan tras borrar', () => {
    const d = new Diagram()
    const first = d.createLayer('A')
    d.deleteLayer(first.id)
    const second = d.createLayer('B')
    expect(second.id).not.toBe(first.id)
  })

  it('duplicar una capa es una sola acción de deshacer', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    const g = d.addGate('and', { x: 0, y: 0 }, 2)
    d.moveElementToLayer(g.id, l.id)
    d.duplicateLayer(l.id)
    expect(d.layersList).toHaveLength(3)
    expect(d.elements).toHaveLength(2)
    d.undo()
    expect(d.layersList).toHaveLength(2)
    expect(d.elements).toHaveLength(1)
  })

  it('setLayers normaliza: añade la principal y recoloca huérfanos', () => {
    const d = new Diagram()
    const g = d.addGate('and', { x: 0, y: 0 }, 2)
    d.setLayers([{ id: 'otra', name: 'Otra', visible: true, locked: false, color: '#fff', opacity: 1 }])
    expect(d.layersList.some((x) => x.id === DEFAULT_LAYER_ID)).toBe(true)
    expect(d.get(g.id)!.layerId).toBe(DEFAULT_LAYER_ID)
  })
})