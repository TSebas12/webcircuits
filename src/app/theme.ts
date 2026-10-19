/**
 * Tema en la aplicación (M6-01/M6-02/M6-18).
 *
 * El **modelo** (tokens, presets, serialización) vive en `src/core/theme/` y es puro. Aquí
 * está lo que necesita el navegador: decidir qué tema toca y **volcarlo al documento**.
 *
 * Cómo se aplica un tema: se escriben **todas** sus variables CSS como estilo en línea en
 * `<html>` (`style.setProperty`). El estilo en línea gana a cualquier regla de `app.css`, así
 * que un tema propio con un par de colores cambiados funciona sin tocar el CSS. Las reglas de
 * `app.css` quedan como **respaldo** para el instante previo a que arranque JavaScript (y para
 * el script anti-destello de `index.html`).
 *
 * `data-theme` (`light`/`dark`) ya no identifica al preset: dice el **color-scheme** (barras de
 * scroll, controles nativos) y es lo que el script anti-destello puede resolver sin JS.
 */

import {
  DARK_THEME,
  DEFAULT_THEME,
  LIGHT_THEME,
  presetById,
} from '../core/theme/presets'
import { cssVarsFor, parseTheme, serializeTheme, type Theme } from '../core/theme/theme'

/** Lo que el usuario ha elegido: automático, un preset, o su tema propio. */
export type ThemeSelection =
  | 'auto'
  | 'light'
  | 'dark'
  | 'high-contrast'
  | 'colorblind'
  | 'monochrome'
  | 'custom'

/** La elección guardada. ⚠️ La lee también el script anti-destello de `index.html`. */
export const THEME_STORAGE_KEY = 'wc-theme'

/** El tema propio del usuario, si lo tiene. */
export const CUSTOM_THEME_KEY = 'wc-theme-custom'

/** Orden del ciclo del botón del marco. */
const CYCLE: readonly ThemeSelection[] = [
  'auto',
  'light',
  'dark',
  'high-contrast',
  'colorblind',
  'monochrome',
]

const SELECTIONS: readonly ThemeSelection[] = [...CYCLE, 'custom']

/** La siguiente elección del ciclo (el tema propio no entra: se elige desde Preferencias). */
export function nextThemeSelection(current: ThemeSelection): ThemeSelection {
  const index = CYCLE.indexOf(current)
  return index === -1 ? 'auto' : CYCLE[(index + 1) % CYCLE.length]!
}

/** ¿Es una elección de fiar? */
export function parseThemeSelection(value: string | null): ThemeSelection {
  return value !== null && (SELECTIONS as readonly string[]).includes(value)
    ? (value as ThemeSelection)
    : 'auto'
}

/**
 * Resuelve la elección a un tema de verdad.
 *
 * Es una función **pura**: toda la lógica de «qué tema toca» se prueba sin navegador.
 */
export function resolveTheme(
  selection: ThemeSelection,
  systemPrefersDark: boolean,
  custom: Theme | null = null,
): Theme {
  if (selection === 'auto') {
    return systemPrefersDark ? DARK_THEME : LIGHT_THEME
  }
  if (selection === 'custom') {
    return custom ?? DEFAULT_THEME
  }
  return presetById(selection) ?? DEFAULT_THEME
}

/** Nombre legible de una elección, para botones y listas. */
export function themeSelectionLabel(selection: ThemeSelection, custom: Theme | null): string {
  if (selection === 'auto') {
    return 'Automático'
  }
  if (selection === 'custom') {
    return custom?.name ?? 'Personalizado'
  }
  return presetById(selection)?.name ?? selection
}

export interface ApplyThemeOptions {
  readonly systemPrefersDark?: boolean
  readonly custom?: Theme | null
  readonly root?: HTMLElement
}

/** El elemento raíz de verdad, o el de mentira de un test. */
function rootOf(options: ApplyThemeOptions): HTMLElement {
  return options.root ?? document.documentElement
}

/**
 * Vuelca un tema al documento: escribe sus variables y ajusta `data-theme`/`color-scheme`.
 * Devuelve el tema que ha quedado, por comodidad.
 */
export function applyTheme(selection: ThemeSelection, options: ApplyThemeOptions = {}): Theme {
  const theme = resolveTheme(selection, options.systemPrefersDark ?? false, options.custom ?? null)
  const root = rootOf(options)

  for (const [name, value] of cssVarsFor(theme)) {
    root.style.setProperty(name, value)
  }
  root.setAttribute('data-theme', theme.base)
  root.style.setProperty('color-scheme', theme.base)
  return theme
}

/** Lee la elección guardada. Si no hay nada (o el almacenamiento está bloqueado), `auto`. */
export function readThemeSelection(storage: Storage = localStorage): ThemeSelection {
  try {
    return parseThemeSelection(storage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

/** Guarda la elección. Si no se puede guardar, la elección dura la sesión. */
export function storeThemeSelection(selection: ThemeSelection, storage: Storage = localStorage): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, selection)
  } catch {
    // Sin persistencia, pero sin molestar al usuario.
  }
}

/** Lee y valida el tema propio guardado. Si está corrupto, se ignora. */
export function readCustomTheme(storage: Storage = localStorage): Theme | null {
  try {
    const raw = storage.getItem(CUSTOM_THEME_KEY)
    if (raw === null) {
      return null
    }
    return parseTheme(raw, DEFAULT_THEME.tokens)
  } catch {
    return null
  }
}

/** Guarda el tema propio. */
export function storeCustomTheme(theme: Theme, storage: Storage = localStorage): void {
  try {
    storage.setItem(CUSTOM_THEME_KEY, serializeTheme(theme))
  } catch {
    // Sin persistencia.
  }
}

/** Borra el tema propio. */
export function clearCustomTheme(storage: Storage = localStorage): void {
  try {
    storage.removeItem(CUSTOM_THEME_KEY)
  } catch {
    // Sin persistencia.
  }
}
