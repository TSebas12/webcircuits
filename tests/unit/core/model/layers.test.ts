import { describe, expect, it } from 'vitest'
import { Diagram } from '../../../../src/core/model/diagram'
import { DEFAULT_LAYER_ID, type Layer } from '../../../../src/core/model/types'

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

  it('los elementos nuevos caen en la capa activa', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    d.activeLayerId = l.id

    const g = d.addGate('and', { x: 0, y: 0 }, 2)
    const w = d.addWire({ x: 0, y: 0 }, { x: 1, y: 0 })
    const b = d.addButton({ x: 2, y: 0 })

    expect(g.layerId).toBe(l.id)
    expect(w.layerId).toBe(l.id)
    expect(b.layerId).toBe(l.id)
  })

  it('borrar la capa activa devuelve la actividad a la principal', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    d.activeLayerId = l.id
    expect(d.activeLayerId).toBe(l.id)

    d.deleteLayer(l.id)
    expect(d.activeLayerId).toBe(DEFAULT_LAYER_ID)
  })

  it('si la capa activa desaparece al cargar, se vuelve a la principal', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    d.activeLayerId = l.id

    d.setLayers([{ id: 'otra', name: 'Otra', visible: true, locked: false, color: '#fff', opacity: 1 }])
    expect(d.activeLayerId).toBe(DEFAULT_LAYER_ID)
  })

  it('reordena las capas para cambiar el z-order', () => {
    const d = new Diagram()
    const a = d.createLayer('A')
    const b = d.createLayer('B')

    expect(d.layersList.map((l) => l.id)).toEqual([DEFAULT_LAYER_ID, a.id, b.id])
    expect(d.moveLayer(a.id, 1)).toBe(true)
    expect(d.layersList.map((l) => l.id)).toEqual([DEFAULT_LAYER_ID, b.id, a.id])
    expect(d.moveLayer(a.id, 1)).toBe(false)
    expect(d.moveLayer(a.id, -1)).toBe(true)
    expect(d.layersList.map((l) => l.id)).toEqual([DEFAULT_LAYER_ID, a.id, b.id])
  })

  it('aislar oculta las demás y ver todas las recupera', () => {
    const d = new Diagram()
    const a = d.createLayer('A')
    const b = d.createLayer('B')

    d.isolateLayer(a.id)
    expect(d.layersList.filter((l) => l.visible).map((l) => l.id)).toEqual([a.id])

    d.showAllLayers()
    expect(d.layersList.every((l) => l.visible)).toBe(true)
    expect(d.layersList.map((l) => l.id)).toContain(b.id)
  })

  it('devuelve los elementos de una capa para seleccionarlos todos', () => {
    const d = new Diagram()
    const a = d.createLayer('A')
    const g = d.addGate('and', { x: 0, y: 0 }, 2)
    const b = d.addButton({ x: 3, y: 0 })
    d.moveElementToLayer(g.id, a.id)

    expect(d.selectAllInLayer(a.id)).toEqual([g.id])
    expect(d.selectAllInLayer(DEFAULT_LAYER_ID)).toEqual([b.id])
  })

  it('setLayers normaliza: añade la principal y recoloca huérfanos', () => {
    const d = new Diagram()
    const g = d.addGate('and', { x: 0, y: 0 }, 2)
    d.setLayers([{ id: 'otra', name: 'Otra', visible: true, locked: false, color: '#fff', opacity: 1 }])
    expect(d.layersList.some((x) => x.id === DEFAULT_LAYER_ID)).toBe(true)
    expect(d.get(g.id)!.layerId).toBe(DEFAULT_LAYER_ID)
  })

  it('las capas nacen y se cargan desbloqueadas', () => {
    const d = new Diagram()
    const created = d.createLayer('L2')
    expect(created.locked).toBe(false)

    // Un fichero antiguo puede no traer `locked`. Antes se copiaba tal cual y la capa
    // aparecía bloqueada sin que el usuario hubiera tocado el candado.
    d.setLayers([
      { id: DEFAULT_LAYER_ID, name: 'Principal', visible: true, locked: false, color: '#888888', opacity: 1 },
      { id: 'legacy', name: 'Antigua', visible: true, color: '#888888', opacity: 1 } as unknown as Layer,
    ])
    expect(d.layersList.find((layer) => layer.id === 'legacy')!.locked).toBe(false)
  })

  // Los ficheros anteriores a M5 no llevan `layerId`. Antes se importaban tal cual: el
  // elemento contaba y se simulaba, pero quedaba fuera de `visibleElements` —no se dibujaba
  // ni se podía tocar—. El lienzo parecía vacío o roto sin ningún aviso.

  it('un elemento sin layerId al importar cae en la principal y se ve', () => {
    const d = new Diagram()
    const g = d.addGate('and', { x: 0, y: 0 }, 2)
    const legacy = { ...g } as Record<string, unknown>
    delete legacy.layerId

    d.importElement(legacy as unknown as typeof g)

    expect(d.get(g.id)!.layerId).toBe(DEFAULT_LAYER_ID)
    expect(d.visibleElements).toHaveLength(1)
  })

  it('un layerId desconocido al importar no deja el elemento invisible', () => {
    const d = new Diagram()
    const g = d.addGate('and', { x: 0, y: 0 }, 2)

    d.importElement({ ...g, layerId: 'no-existe' })

    expect(d.get(g.id)!.layerId).toBe(DEFAULT_LAYER_ID)
    expect(d.visibleElements).toHaveLength(1)
  })

  it('importar conserva una capa válida', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    const g = d.addGate('and', { x: 0, y: 0 }, 2)

    d.importElement({ ...g, layerId: l.id })

    expect(d.get(g.id)!.layerId).toBe(l.id)
  })

  it('ocultar la capa activa traslada la edición a una visible', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    d.activeLayerId = l.id

    d.setLayerVisible(l.id, false)

    expect(d.activeLayerId).toBe(DEFAULT_LAYER_ID)
    expect(d.layersList.find((x) => x.id === DEFAULT_LAYER_ID)!.visible).toBe(true)
  })

  it('activar una capa oculta la muestra, para no colocar a ciegas', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')
    d.setLayerVisible(l.id, false)

    d.activeLayerId = l.id

    expect(d.layersList.find((x) => x.id === l.id)!.visible).toBe(true)
  })

  it('aislar una capa deja la edición en ella', () => {
    const d = new Diagram()
    const l = d.createLayer('L2')

    d.isolateLayer(l.id)

    expect(d.activeLayerId).toBe(l.id)
    expect(d.layersList.find((x) => x.id === l.id)!.visible).toBe(true)
  })
})