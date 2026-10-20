/**
 * Frecuencia de reloj en Hz y determinismo (M7B-05).
 *
 * Convierte entre frecuencia (Hz) y medio periodo (ms), y ofrece una semilla
 * determinista para que una misma configuración produzca la misma secuencia.
 */

/** Medio periodo en ms para una frecuencia dada en Hz. */
export function halfPeriodMs(hz: number): number {
  if (!Number.isFinite(hz) || hz <= 0) return 0
  return 1000 / (2 * hz)
}

/** Frecuencia en Hz a partir del medio periodo en ms. */
export function frequencyHz(halfPeriod: number): number {
  if (!Number.isFinite(halfPeriod) || halfPeriod <= 0) return 0
  return 1000 / (2 * halfPeriod)
}

/** Semilla determinista a partir de una cadena (djb2). */
export function deterministicSeed(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(33, hash) + input.charCodeAt(i)) | 0
  }
  return hash >>> 0
}