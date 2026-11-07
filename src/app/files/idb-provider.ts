/**
 * Proveedor IndexedDB (M4-16).
 *
 * Guarda proyectos y handles en IndexedDB para autoguardado y recuperación.
 * No pide ubicación: todo es silencioso.
 */

import type { FileHandle, IFileProvider } from './ifile-provider'

const DB_NAME = 'webcircuits'
const STORE = 'projects'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'name' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class IdbProvider implements IFileProvider {
  async open(): Promise<{ name: string; content: string } | null> {
    try {
      const db = await openDb()
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const req = store.getAll()
      const rows = await new Promise<{ name: string; content: string; savedAt?: number }[]>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result as { name: string; content: string; savedAt?: number }[])
        req.onerror = () => reject(req.error)
      })
      db.close()
      if (rows.length === 0) return null
      // `getAll()` devuelve por clave, no por fecha. Se elige la escritura más reciente: si
      // algún día conviven varias (autosave y otra cosa), la recuperación no debe cargar una
      // versión vieja solo porque su nombre ordene después.
      const last = rows.reduce((newest, row) =>
        (row.savedAt ?? 0) > (newest.savedAt ?? 0) ? row : newest,
      )
      if (last.content.length > 50 * 1024 * 1024) return null
      return { name: last.name, content: last.content }
    } catch {
      return null
    }
  }

  async save(content: string, suggestedName: string, _handle?: FileHandle): Promise<FileHandle | null> {
    if (content.length > 50 * 1024 * 1024) return null
    try {
      const db = await openDb()
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      await new Promise<void>((resolve, reject) => {
        const req = store.put({ name: suggestedName, content, savedAt: Date.now() })
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
      db.close()
      return { name: suggestedName }
    } catch {
      return null
    }
  }

  async saveAs(content: string, suggestedName: string): Promise<FileHandle | null> {
    return this.save(content, suggestedName)
  }
}