/**
 * Controles del osciloscopio (M7-03): zoom temporal, pausa y limpieza.
 *
 * La lógica pura vive aquí para que se pueda probar sin montar Svelte; la componente solo
 * traduce botones en llamadas a estas funciones.
 */
export const MIN_ZOOM = 1 / 8
export const MAX_ZOOM = 16

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function zoomIn(zoom: number, factor = 2): number {
  return clampZoom(zoom * factor)
}

export function zoomOut(zoom: number, factor = 2): number {
  return clampZoom(zoom / factor)
}

/**
 * Devuelve la ventana visible de una señal según el zoom temporal.
 *
 * Un zoom mayor que 1 acerca (menos muestras visibles); uno menor que 1 aleja (más muestras).
 * Si no hay muestras, devuelve el arreglo vacío.
 */
export function visibleWindow(samples: readonly number[], zoom: number): readonly number[] {
  if (samples.length === 0) return samples
  const safeZoom = clampZoom(zoom)
  const windowSize = Math.max(1, Math.round(samples.length / safeZoom))
  if (windowSize >= samples.length) return samples
  return samples.slice(samples.length - windowSize)
}