/** Preferencias del usuario (M4-10). Persistidas en localStorage. */
export interface Settings {
  theme: 'auto' | 'light' | 'dark'
  gridVisible: boolean
  snapToGrid: boolean
  autosaveEnabled: boolean
}

const KEY = 'webcircuits.settings'
const DEFAULTS: Settings = {
  theme: 'auto',
  gridVisible: true,
  snapToGrid: true,
  autosaveEnabled: true,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}