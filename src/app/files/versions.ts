/** Historial de versiones local (M4-21). Snapshots en localStorage. */
const KEY = 'webcircuits.versions'

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
  const v: Version = { id: `${Date.now()}`, name, content, savedAt: Date.now() }
  const list = [v, ...listVersions()].slice(0, 20)
  localStorage.setItem(KEY, JSON.stringify(list))
  return v
}

export function deleteVersion(id: string): void {
  const list = listVersions().filter((v) => v.id !== id)
  localStorage.setItem(KEY, JSON.stringify(list))
}