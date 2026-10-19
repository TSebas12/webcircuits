import type { RenderTheme } from './ir-renderer'

/** Valores de emergencia, por si el CSS no definiera un token (no debería pasar nunca). */
const FALLBACK: RenderTheme = {
  background: '#ffffff',
  gridDot: '#d5d9e0',
  gridDotStrong: '#aeb5c1',
  wireIdle: '#22252b',
  wireHigh: '#d93025',
  wireLow: '#1565c0',
  wireFloating: '#9aa0a6',
  wireBus: '#7c4dff',
  wireSelected: '#3b82f6',
  symbolFill: '#ffffff',
  symbolStroke: '#22252b',
  gateText: '#191c21',
  gateError: '#d93025',
  selection: '#3b82f6',
  hover: '#7aa7f0',
  pinDot: '#8b93a1',
  handle: '#3b82f6',
  stateOff: '#b7c9b8',
  stateZero: '#5b4949',
  stateOne: '#ff4a1f',
}

/**
 * Puente tema → lienzo.
 *
 * El canvas **no** entiende variables CSS:
 *
 *     ctx.fillStyle = 'var(--wc-wire)'   // ❌ no funciona, se ignora
 *
 * Hay que leer el valor ya calculado con `getComputedStyle`. Esto es el `theme-bridge`,
 * un cimiento crítico: sin él no habría ni temas (M6) ni colores por capa (M5).
 *
 * Se llama al arrancar y **solo** al cambiar de tema. Jamás en cada fotograma.
 */
export function readTheme(root: HTMLElement = document.documentElement): RenderTheme {
  const styles = getComputedStyle(root)
  const read = (name: string, fallback: string): string =>
    styles.getPropertyValue(name).trim() || fallback

  return {
    background: read('--wc-diagram-bg', FALLBACK.background),
    gridDot: read('--wc-grid-dot', FALLBACK.gridDot),
    gridDotStrong: read('--wc-grid-dot-strong', FALLBACK.gridDotStrong),
    wireIdle: read('--wc-wire', FALLBACK.wireIdle),
    wireHigh: read('--wc-wire-high', FALLBACK.wireHigh),
    wireLow: read('--wc-wire-low', FALLBACK.wireLow),
    wireFloating: read('--wc-wire-floating', FALLBACK.wireFloating),
    wireBus: read('--wc-wire-bus', FALLBACK.wireBus),
    wireSelected: read('--wc-wire-selected', FALLBACK.wireSelected),
    symbolFill: read('--wc-symbol-fill', FALLBACK.symbolFill),
    symbolStroke: read('--wc-symbol-stroke', FALLBACK.symbolStroke),
    gateText: read('--wc-gate-text', FALLBACK.gateText),
    gateError: read('--wc-error', FALLBACK.gateError),
    selection: read('--wc-selection', FALLBACK.selection),
    hover: read('--wc-hover', FALLBACK.hover),
    pinDot: read('--wc-pin-dot', FALLBACK.pinDot),
    handle: read('--wc-handle', FALLBACK.handle),
    stateOff: read('--wc-state-off', FALLBACK.stateOff),
    stateZero: read('--wc-state-zero', FALLBACK.stateZero),
    stateOne: read('--wc-state-one', FALLBACK.stateOne),
  }
}

/**
 * Avisa cuando cambia el tema: porque el sistema pasa a modo oscuro, o porque alguien
 * tocó el atributo `data-theme` (los temas propios llegan en M6).
 *
 * Devuelve la función para dejar de escuchar.
 */
export function watchTheme(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const handleMedia = (): void => {
    onChange()
  }
  media.addEventListener('change', handleMedia)

  const observer = new MutationObserver(() => {
    onChange()
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style'],
  })

  return () => {
    media.removeEventListener('change', handleMedia)
    observer.disconnect()
  }
}
