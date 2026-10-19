/**
 * Preferencias del usuario (M4-10). Persistidas en localStorage.
 *
 * ⚠️ El **tema** no se guarda aquí aunque viaje en este objeto: la fuente de verdad es
 * `theme.ts` (clave `wc-theme`), que además lee el script anti-destello de `index.html`. Si
 * se guardara en dos claves distintas, el selector de Preferencias y el botón de tema del
 * marco podrían discrepar —y de hecho discrepaban. Aquí se delega.
 */

import { readThemeSelection, storeThemeSelection, type ThemeSelection } from './theme'

export type WirePaintOnPower = 'always' | 'never' | 'defaults'

export interface Settings {
  theme: ThemeSelection
  gridVisible: boolean
  snapToGrid: boolean
  autosaveEnabled: boolean
  paintWiresOnPower: WirePaintOnPower
  /** Cinco colores guardados por el usuario para el modo cableado. */
  savedWireColors: string[]
}

/** Se dispara al guardar las preferencias, para que la aplicación se reajuste sin recargar. */
export const SETTINGS_EVENT = 'wc-settings-changed'

const KEY = 'webcircuits.settings'
const DEFAULTS: Settings = {
  theme: 'auto',
  gridVisible: true,
  snapToGrid: true,
  autosaveEnabled: true,
  paintWiresOnPower: 'defaults',
  savedWireColors: ['#ff4a1f', '#4a90e2', '#50c878', '#f5a623', '#9b59b6'],
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    const stored = raw ? (JSON.parse(raw) as Partial<Settings>) : {}
    const merged = { ...DEFAULTS, ...stored, theme: readThemeSelection() }
    if (!Array.isArray(merged.savedWireColors) || merged.savedWireColors.length !== 5) {
      merged.savedWireColors = [...DEFAULTS.savedWireColors]
    }
    return merged
  } catch {
    return { ...DEFAULTS, theme: readThemeSelection() }
  }
}

export function saveSettings(s: Settings): void {
  storeThemeSelection(s.theme)
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s }))
  } catch {
    // Sin persistencia, pero sin molestar al usuario con un error que no puede resolver.
  }
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT))
}
