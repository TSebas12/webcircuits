/**
 * Historial de versiones local (M4-21). Instantáneas en `localStorage`.
 *
 * ⚠️ `localStorage` tiene una cuota pequeña (unos 5 MB por origen) y `setItem` **lanza** si se
 * pasa. Guardar un proyecto grande tumbaba el autoguardado de versiones con una excepción.
 * Ahora, si no cabe, se van tirando las versiones más viejas hasta que entre (o hasta que
 * solo quede la nueva, que entonces se intenta igualmente y, si tampoco cabe, se avisa
 * devolviendo el error).
 */

const KEY = 'webcircuits.versions'
const MAX = 20

export interface Version {
  readonly id: string
  readonly name: string
  readonly content: string
  readonly savedAt: number
}

export function listVersions(): Version[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Version[]) : []
  } catch {
    return []
  }
}

export function saveVersion(name: string, content: string): Version {
  const v: Version = { id: nextId(), name, content, savedAt: Date.now() }
  // Se prueban listas cada vez más cortas: primero las `MAX` más recientes, luego quitando
  // por el final, hasta que una quepa.
  let list = [v, ...listVersions()].slice(0, MAX)
  while (true) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list))
      return v
    } catch {
      if (list.length <= 1) {
        // Ni siquiera la versión nueva cabe: se deja constancia y no se rompe la aplicación.
        throw new Error('No hay espacio para guardar la versión')
      }
      list = list.slice(0, -1)
    }
  }
}

export function deleteVersion(id: string): void {
  const list = listVersions().filter((v) => v.id !== id)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Si no cabe al borrar, se deja como estaba.
  }
}

/** Un id único incluso si se guardan dos versiones en el mismo milisegundo. */
function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
