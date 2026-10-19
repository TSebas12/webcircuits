/**
 * Contraste WCAG (M6-19).
 *
 * Cálculo puro, sin navegador, para poder comprobar en un test que ningún preset baja del
 * mínimo AA en el texto. Se implementa la fórmula de la recomendación (WCAG 2.1, «contrast
 * ratio»): luminancia relativa y `(L1 + 0.05) / (L2 + 0.05)`.
 */

export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

/** ¿Es un color en hexadecimal (`#rgb` o `#rrggbb`)? */
function isHex(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
}

/**
 * Convierte un color hexadecimal en sus canales.
 *
 * Solo entiende hexadecimal: es lo que usan los tokens. Lanza si no lo es, para no comparar
 * dos colores «válidos» que en realidad son basura.
 */
export function parseHex(value: string): Rgb {
  const hex = value.trim()
  if (!isHex(hex)) {
    throw new Error(`No es un color hexadecimal: ${value}`)
  }
  const body = hex.slice(1)
  const full = body.length === 3 ? body.replace(/./g, (c) => c + c) : body
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/** Luminancia relativa de un color (0 = negro, 1 = blanco). */
export function relativeLuminance(color: Rgb): number {
  const channel = (value: number): number => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

/**
 * Relación de contraste entre dos colores (de 1 a 21).
 *
 * El orden no importa: la fórmula siempre pone el más claro arriba.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** El mismo cálculo, partiendo de dos colores hexadecimales. */
export function contrastHex(a: string, b: string): number {
  return contrastRatio(parseHex(a), parseHex(b))
}

/** Umbrales de la WCAG. Texto «grande» es ≥ 18,66 px en negrita o ≥ 24 px. */
export const AA_TEXT = 4.5
export const AA_LARGE = 3
export const AAA_TEXT = 7
export const AAA_LARGE = 4.5

/** ¿Cumple AA? */
export function meetsAA(ratio: number, large = false): boolean {
  return ratio >= (large ? AA_LARGE : AA_TEXT)
}

/** ¿Cumple AAA? */
export function meetsAAA(ratio: number, large = false): boolean {
  return ratio >= (large ? AAA_LARGE : AAA_TEXT)
}
