/**
 * Notación de valores de un bus o una probeta (M3-08).
 *
 * Feature nueva: el original siempre enseña en hexadecimal, pero aquí el usuario puede
 * elegir hex / decimal / binario. La lógica de formato vive aquí (puro, sin DOM) para que
 * sea testeable y reutilizable desde el render y los diálogos.
 */

/** Cómo se enseña un valor. */
export type Notation = 'hex' | 'dec' | 'bin'

/** Lista de notaciones disponibles, en el orden en que se ciclan. */
export const NOTATIONS: readonly Notation[] = ['hex', 'dec', 'bin']

/** Normaliza un valor al ancho indicado (máscara de bits), por si llega sin normalizar. */
export function maskToWidth(value: number, bitWidth: number): number {
  const width = Math.max(1, Math.min(bitWidth, 32))
  if (width === 32) return value >>> 0
  return value & ((1 << width) - 1)
}

/** Formatea un valor según la notación y el ancho. */
export function formatValue(value: number, bitWidth: number, notation: Notation): string {
  const masked = maskToWidth(value, bitWidth)
  switch (notation) {
    case 'hex':
      // Al menos un dígito; para buses anchos se rellenan con ceros a la izquierda
      // para que el ancho visual coincida con el ancho del bus.
      return '0x' + masked.toString(16).toUpperCase().padStart(Math.ceil(bitWidth / 4), '0')
    case 'dec':
      return String(masked)
    case 'bin':
      return '0b' + masked.toString(2).padStart(bitWidth, '0')
  }
}

/** Cicla a la siguiente notación. */
export function nextNotation(current: Notation): Notation {
  const index = NOTATIONS.indexOf(current)
  return NOTATIONS[(index + 1) % NOTATIONS.length]!
}