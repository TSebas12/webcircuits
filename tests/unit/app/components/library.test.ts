import { describe, expect, it } from 'vitest'
import { createComponentDocument, type SerializedComponent } from '../../../../src/core/persist/component-format'
import { ComponentLibrary, MemoryComponentStore } from '../../../../src/app/components/library/library'

function component(name: string, description = ''): SerializedComponent {
  return createComponentDocument({
    metadata: {
      name,
      description,
      author: 'Pruebas',
      createdAt: '2026-10-22T00:00:00.000Z',
      tags: ['prueba'],
    },
    rootCircuitId: 'root',
    circuits: [{ id: 'root', name, elements: [] }],
  })
}

function clockedLibrary(): {
  readonly library: ComponentLibrary
  readonly store: MemoryComponentStore
  readonly tick: () => void
} {
  let step = 0
  let id = 0
  const store = new MemoryComponentStore()
  const library = new ComponentLibrary(store, {
    now: () => new Date(Date.UTC(2026, 9, 22, 12, 0, step++)),
    newId: () => `component-${++id}`,
  })
  return { library, store, tick: () => (step += 1) }
}

describe('biblioteca local de componentes (M4C-04)', () => {
  it('guarda los metadatos planos y el documento validado', async () => {
    const { library } = clockedLibrary()
    const saved = await library.save(component('Sumador', 'Cuatro bits'))

    expect(saved.id).toBe('component-1')
    expect(saved.name).toBe('Sumador')
    expect(saved.description).toBe('Cuatro bits')
    expect(saved.tags).toEqual(['prueba'])
    expect(saved.document.rootCircuitId).toBe('root')
    expect(saved.savedAt).toBe('2026-10-22T12:00:00.000Z')
  })

  it('no duplica el mismo documento: actualiza la entrada y su fecha', async () => {
    const { library } = clockedLibrary()
    const first = await library.save(component('Sumador'))

    const second = await library.save(component('Sumador'))

    expect(second.id).toBe(first.id)
    expect(second.savedAt).not.toBe(first.savedAt)
    expect(await library.list()).toHaveLength(1)
  })

  it('distingue componentes con el mismo nombre pero distinto contenido', async () => {
    const { library } = clockedLibrary()
    await library.save(component('Sumador', 'Versión A'))

    const other = await library.save(component('Sumador', 'Versión B'))

    expect(other.id).toBe('component-2')
    expect(await library.list()).toHaveLength(2)
  })

  it('ordena por fecha de guardado, lo más reciente primero', async () => {
    const { library, tick } = clockedLibrary()
    const older = await library.save(component('Viejo'))
    tick()
    const newer = await library.save(component('Nuevo'))

    const list = await library.list()

    expect(list.map((entry) => entry.id)).toEqual([newer.id, older.id])
  })

  it('otra instancia sobre el mismo almacén ve lo guardado', async () => {
    const { library, store } = clockedLibrary()
    const saved = await library.save(component('Persistente'))

    const reopened = new ComponentLibrary(store, {
      now: () => new Date('2026-10-23T00:00:00.000Z'),
      newId: () => 'otro-id',
    })

    expect((await reopened.list()).map((entry) => entry.id)).toEqual([saved.id])
  })

  it('borra una entrada sin tocar las demás', async () => {
    const { library } = clockedLibrary()
    const first = await library.save(component('Uno'))
    const second = await library.save(component('Dos'))

    await library.remove(first.id)
    const list = await library.list()

    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(second.id)
  })

  it('rechaza un documento inválido antes de guardarlo', async () => {
    const { library } = clockedLibrary()
    const invalid = {
      format: 'otro',
      version: 1,
      kind: 'component',
      metadata: { name: 'X' },
      rootCircuitId: 'root',
      circuits: [],
    } as unknown as SerializedComponent

    await expect(library.save(invalid)).rejects.toThrow(/Formato desconocido/)
    expect(await library.list()).toHaveLength(0)
  })
})
