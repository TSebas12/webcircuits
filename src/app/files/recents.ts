/** Proyectos recientes (M4-20). Persistidos en localStorage (lista de nombres). */
const KEY = 'webcircuits.recents'

export function getRecents(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string') : []
  } catch {
    return []
  }
}

export function addRecent(name: string): void {
  try {
    const list = getRecents().filter((n) => n !== name)
    list.unshift(name)
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)))
  } catch {
    // Si localStorage falla (cuota), no rompemos la UI.
  }
}

export function clearRecents(): void {
  localStorage.removeItem(KEY)
}