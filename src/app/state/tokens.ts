/**
 * Catálogo de tokens de tema.
 *
 * Portado del concepto de M2-14: todos los colores del render y de la UI viven aquí
 * como nombres de variables CSS (`--wc-*`). El render **nunca** usa un color literal:
 * lee los valores con `readTheme()` (el `theme-bridge`), que a su vez lee estas
 * variables ya calculadas con `getComputedStyle`.
 *
 * La paleta concreta está en `src/app.css` (una por valor de `data-theme`).
 * Añadir un token nuevo exige tocar tres sitios: este catálogo, `app.css` y el
 * `FALLBACK` de `render/theme-bridge.ts`.
 */

/** Nombres de los tokens que el lienzo consume (vía `RenderTheme`). */
export const CANVAS_TOKENS = [
  '--wc-diagram-bg',
  '--wc-grid-dot',
  '--wc-grid-dot-strong',
  '--wc-wire',
  '--wc-symbol-fill',
  '--wc-symbol-stroke',
  '--wc-selection',
  '--wc-pin-dot',
  '--wc-state-off',
  '--wc-state-zero',
  '--wc-state-one',
] as const

/** Nombres de los tokens de la interfaz (botones, paneles, texto). */
export const UI_TOKENS = [
  '--bg',
  '--fg',
  '--fg-muted',
  '--panel-bg',
  '--panel-bg-hover',
  '--border',
] as const

export type CanvasToken = (typeof CANVAS_TOKENS)[number]
export type UiToken = (typeof UI_TOKENS)[number]
export type ThemeToken = CanvasToken | UiToken

/** Comprueba que un nombre sea un token conocido. */
export function isThemeToken(name: string): name is ThemeToken {
  return (CANVAS_TOKENS as readonly string[]).includes(name) ||
    (UI_TOKENS as readonly string[]).includes(name)
}