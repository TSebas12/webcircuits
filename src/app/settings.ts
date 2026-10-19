/**
 * Preferencias del usuario (M4-10). Persistidas en localStorage.
 *
 * ⚠️ El **tema** no se guarda aquí aunque viaje en este objeto: la fuente de verdad es
 * `theme.ts` (clave `wc-theme`), que además lee el script anti-destello de `index.html`. Si
 * se guardara en dos claves distintas, el selector de Preferencias y el botón de tema del
 * marco podrían discrepar —y de hecho discrepaban. Aquí se delega.
 */

import { readThemeChoice, storeThemeChoice, type ThemeChoice } from './theme'

export interface Settings {
  theme: ThemeChoice
  gridVisible: boolean
  snapToGrid: boolean
  autosaveEnabled: boolean
}

/** Se dispara al guardar las preferencias, para que la aplicación se reajuste sin recargar. */
export const SETTINGS_EVENT = 'wc-settings-changed'

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
    const stored = raw ? (JSON.parse(raw) as Partial<Settings>) : {}
    return { ...DEFAULTS, ...stored, theme: readThemeChoice() }
  } catch {
    return { ...DEFAULTS, theme: readThemeChoice() }
  }
}

export function saveSettings(s: Settings): void {
  storeThemeChoice(s.theme)
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s }))
  } catch {
    // Sin persistencia, pero sin molestar al usuario con un error que no puede resolver.
  }
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT))
}
