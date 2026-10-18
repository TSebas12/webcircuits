/**
 * Tema claro/oscuro.
 *
 * Esto es un adelanto del interruptor: la feature completa de **temas propios, colores
 * por categoría y color de cables** es el hito **M6**. Aquí solo se decide entre claro y
 * oscuro; nada más.
 *
 * Reparto de responsabilidades:
 *
 * | Quién | Qué hace |
 * |---|---|
 * | `app.css` | Declara las paletas: una por valor de `data-theme` |
 * | **este módulo** | Decide **cuál** toca y lo escribe en `<html>` |
 * | `render/theme-bridge.ts` | Nota el cambio y repinta el lienzo |
 *
 * Consecuencia consciente: el tema **siempre** lo resuelve JavaScript. Es un precio
 * pequeño —el resto de la aplicación también lo hace— y a cambio cada paleta vive en un
 * único sitio, en vez de repetirse entre la media query del sistema y la elección del
 * usuario. En M6, con muchos más colores, esa diferencia se nota.
 */

/** Lo que el usuario ha elegido. `auto` = que mande el sistema. */
export type ThemeChoice = 'auto' | 'light' | 'dark'

/** El tema real, ya resuelto. Es el valor que acaba en `data-theme`. */
export type ResolvedTheme = 'light' | 'dark'

/**
 * Dónde se guarda la elección.
 *
 * ⚠️ Lo lee también el script anti-destello de `index.html`. Si cambia aquí, cambia allí.
 */
export const THEME_STORAGE_KEY = 'wc-theme'

/** Orden del ciclo al pulsar el botón: auto → claro → oscuro → auto. */
const NEXT: Readonly<Record<ThemeChoice, ThemeChoice>> = {
  auto: 'light',
  light: 'dark',
  dark: 'auto',
}

/** El siguiente del ciclo. */
export function nextThemeChoice(current: ThemeChoice): ThemeChoice {
  return NEXT[current]
}

/** ¿Este texto es una elección válida? */
function isThemeChoice(value: string): value is ThemeChoice {
  return value === 'auto' || value === 'light' || value === 'dark'
}

/**
 * Convierte lo que haya guardado en una elección de fiar.
 * El almacenamiento lo puede tocar cualquiera, así que no nos fiamos de su contenido.
 */
export function parseThemeChoice(value: string | null): ThemeChoice {
  return value !== null && isThemeChoice(value) ? value : 'auto'
}

/**
 * Decide el tema real.
 *
 * Es una función **pura**: toda la lógica del tema se prueba sin navegador.
 */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === 'auto') {
    return systemPrefersDark ? 'dark' : 'light'
  }
  return choice
}

/** Vuelca la elección al documento y devuelve el tema que ha quedado. */
export function applyTheme(
  choice: ThemeChoice,
  systemPrefersDark: boolean,
  root: HTMLElement = document.documentElement,
): ResolvedTheme {
  const resolved = resolveTheme(choice, systemPrefersDark)
  root.setAttribute('data-theme', resolved)
  return resolved
}

/** Lee la elección guardada. Si no hay nada (o el almacenamiento está bloqueado), `auto`. */
export function readThemeChoice(storage: Storage = localStorage): ThemeChoice {
  try {
    return parseThemeChoice(storage.getItem(THEME_STORAGE_KEY))
  } catch {
    // El almacenamiento puede estar bloqueado: modo privado, iframes restringidos…
    return 'auto'
  }
}

/** Guarda la elección. Si no se puede guardar, no pasa nada: durará la sesión. */
export function storeThemeChoice(choice: ThemeChoice, storage: Storage = localStorage): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // Sin persistencia, pero sin molestar al usuario con un error que no puede resolver.
  }
}
