import type { RenderTheme } from './ir-renderer'

/** Valores de emergencia, por si el CSS no definiera un token (no debería pasar nunca). */
const FALLBACK: RenderTheme = {
  background: '#ffffff',
  gridDot: '#d5d9e0',
  gridDotStrong: '#aeb5c1',
  wire: '#22252b',
  symbolFill: '#ffffff',
  symbolStroke: '#22252b',
  selection: '#3b82f6',
  pinDot: '#8b93a1',
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
    wire: read('--wc-wire', FALLBACK.wire),
    symbolFill: read('--wc-symbol-fill', FALLBACK.symbolFill),
    symbolStroke: read('--wc-symbol-stroke', FALLBACK.symbolStroke),
    selection: read('--wc-selection', FALLBACK.selection),
    pinDot: read('--wc-pin-dot', FALLBACK.pinDot),
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
