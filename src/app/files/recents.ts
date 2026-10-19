/** Proyectos recientes (M4-20). Persistidos en localStorage (lista de nombres). */
const KEY = 'webcircuits.recents'

export function getRecents(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function addRecent(name: string): void {
  const list = getRecents().filter((n) => n !== name)
  list.unshift(name)
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)))
}

export function clearRecents(): void {
  localStorage.removeItem(KEY)
}