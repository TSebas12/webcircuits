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
})