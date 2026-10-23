/**
 * Persistencia de la biblioteca de componentes en IndexedDB (M4C-04).
 *
 * Base separada de los proyectos (`webcircuits`): la biblioteca es del usuario, no de un
 * fichero. Guarda documentos ya validados y no toca el proyecto abierto.
 */

import type { ComponentStore, LibraryComponent } from './library'

const DB_NAME = 'webcircuits-components'
const DB_VERSION = 1
const STORE = 'components'

export class IndexedDbComponentStore implements ComponentStore {
  private dbPromise: Promise<IDBDatabase> | null = null

  private open(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('La biblioteca está abierta en otra pestaña.'))
    })
    return this.dbPromise
  }

  async list(): Promise<readonly LibraryComponent[]> {
    const db = await this.open()
    const transaction = db.transaction(STORE, 'readonly')
    const done = transactionDone(transaction)
    const request = transaction.objectStore(STORE).getAll()
    const rows = await requestResult<LibraryComponent[]>(request)
    await done
    return rows
  }

  async put(entry: LibraryComponent): Promise<void> {
    const db = await this.open()
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).put(entry)
    await transactionDone(transaction)
  }

  async delete(id: string): Promise<void> {
    const db = await this.open()
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).delete(id)
    await transactionDone(transaction)
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('Transacción cancelada.'))
  })
}
