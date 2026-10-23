/**
 * Texto de la etiqueta de un bus (M3B-03).
 *
 * Un bus visual no es una señal independiente: son cables reales plegados. Por eso el valor
 * que se enseña es el de sus bits, y `z` mientras no hay simulación o falta algún bit. No se
 * inventa un valor por defecto eléctrico que luego no se cumpla.
 */

/** Rango legible, con el bit 0 siempre a la derecha: `[7:0]`. */
export function busBitRange(bits: number): string {
  const width = Number.isFinite(bits) ? Math.max(1, Math.floor(bits)) : 1
  return `[${width - 1}:0]`
}

/**
 * Valor de los bits en el orden del bus (índice 0 = bit 0).
 *
 * Si falta un bit, el valor no está definido y se muestra `z`. Para buses de hasta 8 bits
 * se usa decimal; a partir de 9, hexadecimal con todos los dígitos.
 */
export function formatBusValue(values: readonly (number | null)[], bits: number): string {
  const width = Number.isFinite(bits) ? Math.max(1, Math.floor(bits)) : 1
  let value = 0
  for (let bit = 0; bit < width; bit += 1) {
    const digit = values[bit]
    if (digit !== 0 && digit !== 1) {
      return 'z'
    }
    if (digit === 1) {
      value += 2 ** bit
    }
  }

  if (width <= 8) {
    return String(value)
  }
  const digits = Math.ceil(width / 4)
  return `0x${value.toString(16).toUpperCase().padStart(digits, '0')}`
}

/**
 * Texto completo: `Nombre [n-1:0] = valor`.
 *
 * Sin nombre se usa `Bus n`, que es el nombre que asigna `planBusGroup` al crear el grupo.
 * Con `values === null` se enseña `z`: es el estado por defecto de un bus sin simulación.
 */
export function busLabelText(
  name: string,
  bits: number,
  values: readonly (number | null)[] | null,
): string {
  const width = Number.isFinite(bits) ? Math.max(1, Math.floor(bits)) : 1
  const title = name.trim() || `Bus ${width}`
  const value = values === null ? 'z' : formatBusValue(values, width)
  return `${title} ${busBitRange(width)} = ${value}`
}
