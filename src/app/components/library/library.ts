/**
 * Biblioteca local de componentes (M4C-04).
 *
 * La biblioteca no guarda circuitos vivos: guarda el documento `.wccomp` ya validado. Así
 * un componente puede reutilizarse en otro proyecto sin arrastrar ids ni estado de edición,
 * y la lista se puede leer sin abrir la jerarquía entera.
 *
 * El almacenamiento se inyecta (`ComponentStore`) para poder probar la lógica sin IndexedDB
 * y para sustituirlo más adelante por otro backend sin tocar la interfaz.
 */

import { validateComponent, type SerializedComponent } from '../../../core/persist/component-format'

/** Una entrada tal como la ve la interfaz: metadatos planos y el documento empaquetado. */
export interface LibraryComponent {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly author: string
  readonly tags: readonly string[]
  readonly createdAt: string
  readonly savedAt: string
  readonly document: SerializedComponent
}

export interface ComponentStore {
  list(): Promise<readonly LibraryComponent[]>
  put(entry: LibraryComponent): Promise<void>
  delete(id: string): Promise<void>
}

/** Almacén en memoria. Se usa en tests y como último recurso si IndexedDB no está. */
export class MemoryComponentStore implements ComponentStore {
  private readonly entries = new Map<string, LibraryComponent>()

  async list(): Promise<readonly LibraryComponent[]> {
    return [...this.entries.values()]
  }

  async put(entry: LibraryComponent): Promise<void> {
    this.entries.set(entry.id, entry)
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id)
  }
}

export interface ComponentLibraryOptions {
  readonly now?: () => Date
  readonly newId?: () => string
}

/**
 * Lógica de la biblioteca: validar al guardar, ordenar al listar y evitar duplicados.
 *
 * Guardar dos veces el mismo documento actualiza la entrada existente en vez de crear otra
 * copia. Para compartir el mismo componente con nombres distintos, cambia los metadatos: el
 * documento forma parte de la huella.
 */
export class ComponentLibrary {
  private readonly store: ComponentStore
  private readonly now: () => Date
  private readonly newId: () => string

  constructor(store: ComponentStore, options: ComponentLibraryOptions = {}) {
    this.store = store
    this.now = options.now ?? (() => new Date())
    this.newId = options.newId ?? defaultId
  }

  async list(): Promise<readonly LibraryComponent[]> {
    const entries = await this.store.list()
    return [...entries].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }

  async save(document: SerializedComponent): Promise<LibraryComponent> {
    const valid = validateComponent(document)
    const fingerprint = JSON.stringify(valid)
    const existing = (await this.store.list()).find(
      (entry) => JSON.stringify(entry.document) === fingerprint,
    )
    const entry: LibraryComponent = {
      id: existing?.id ?? this.newId(),
      name: valid.metadata.name,
      description: valid.metadata.description,
      author: valid.metadata.author,
      tags: [...valid.metadata.tags],
      createdAt: valid.metadata.createdAt,
      savedAt: this.now().toISOString(),
      document: valid,
    }
    await this.store.put(entry)
    return entry
  }

  async remove(id: string): Promise<void> {
    await this.store.delete(id)
  }
}

function defaultId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return `component-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
