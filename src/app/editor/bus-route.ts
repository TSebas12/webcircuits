/**
 * Rutado automático de la línea de un bus (M3B-02).
 *
 * En M3B-01 el bus es un grupo de cables paralelos y su línea se coloca en la mediana. Eso
 * puede dejarla encima de una pieza. Este módulo busca el canal libre más cercano: desplaza
 * solo la línea y los codos, nunca las puntas de los cables, así que la conectividad no cambia.
 */

import type { GridPoint, GridRect } from '../../core/model/types'
import type { BusGeometry, BusSegment } from './bus-group'

/** Separación mínima que se deja entre la línea y una pieza. */
const DEFAULT_MARGIN = 0.25

/** Hasta dónde se puede mover la línea para buscar un canal libre. */
const DEFAULT_MAX_OFFSET = 12

export interface BusRouteOptions {
  /** Separación con las piezas. Con 0, tocar el borde ya cuenta como choque. */
  readonly margin?: number
  /** Máximo desplazamiento en unidades de rejilla. */
  readonly maxOffset?: number
}

/** Coordenada fija de la línea: `y` si es horizontal, `x` si es vertical. */
export function spineCross(geometry: BusGeometry): number {
  return geometry.orientation === 'horizontal' ? geometry.spine.p1.y : geometry.spine.p1.x
}

/**
 * Mueve la línea del bus a otra coordenada, dejando las puntas de los cables donde están.
 *
 * Los codos (`stubs`) tienen `p1` en la punta del cable y `p2` en la línea. Al desplazar la
 * línea solo se mueve `p2`: el codo se alarga o se acorta, pero sigue unido al cable.
 */
export function moveBusSpine(geometry: BusGeometry, cross: number): BusGeometry {
  const current = spineCross(geometry)
  const delta = cross - current
  if (delta === 0) {
    return geometry
  }

  const shift = (point: GridPoint): GridPoint =>
    geometry.orientation === 'horizontal'
      ? { x: point.x, y: point.y + delta }
      : { x: point.x + delta, y: point.y }

  return {
    orientation: geometry.orientation,
    spine: { p1: shift(geometry.spine.p1), p2: shift(geometry.spine.p2) },
    stubs: geometry.stubs.map((stub) => ({ p1: stub.p1, p2: shift(stub.p2) })),
  }
}

function normalized(rect: GridRect): GridRect {
  return {
    x0: Math.min(rect.x0, rect.x1),
    y0: Math.min(rect.y0, rect.y1),
    x1: Math.max(rect.x0, rect.x1),
    y1: Math.max(rect.y0, rect.y1),
  }
}

/** ¿El tramo recto toca el rectángulo? Solo se usa con la línea del bus. */
function segmentHitsRect(segment: BusSegment, rect: GridRect, margin: number): boolean {
  const box = normalized(rect)
  const x0 = box.x0 - margin
  const x1 = box.x1 + margin
  const y0 = box.y0 - margin
  const y1 = box.y1 + margin

  if (segment.p1.y === segment.p2.y) {
    const y = segment.p1.y
    if (y < y0 || y > y1) {
      return false
    }
    const start = Math.min(segment.p1.x, segment.p2.x)
    const end = Math.max(segment.p1.x, segment.p2.x)
    return end >= x0 && start <= x1
  }

  if (segment.p1.x === segment.p2.x) {
    const x = segment.p1.x
    if (x < x0 || x > x1) {
      return false
    }
    const start = Math.min(segment.p1.y, segment.p2.y)
    const end = Math.max(segment.p1.y, segment.p2.y)
    return end >= y0 && start <= y1
  }

  return false
}

function collisionCount(
  geometry: BusGeometry,
  obstacles: readonly GridRect[],
  margin: number,
): number {
  let count = 0
  for (const obstacle of obstacles) {
    if (segmentHitsRect(geometry.spine, obstacle, margin)) {
      count++
    }
  }
  return count
}

/**
 * Elige el canal libre más cercano a la mediana.
 *
 * Se prueban `mediana ± 1, ± 2...` y se queda el primero sin choques. Si no hay ninguno
 * dentro del límite, devuelve el que menos piezas toque, que al menos es el menos malo.
 */
export function routeBusGeometry(
  geometry: BusGeometry,
  obstacles: readonly GridRect[],
  options: BusRouteOptions = {},
): BusGeometry {
  if (obstacles.length === 0) {
    return geometry
  }

  const margin = Math.max(0, options.margin ?? DEFAULT_MARGIN)
  const maxOffset = Math.max(0, Math.floor(options.maxOffset ?? DEFAULT_MAX_OFFSET))
  const start = spineCross(geometry)
  let best = geometry
  let bestCollisions = collisionCount(best, obstacles, margin)

  if (bestCollisions === 0) {
    return geometry
  }

  for (let distance = 1; distance <= maxOffset; distance++) {
    // Primero hacia arriba/izquierda y luego al otro lado; el empate se queda con el primero.
    for (const cross of [start + distance, start - distance]) {
      const candidate = moveBusSpine(geometry, cross)
      const collisions = collisionCount(candidate, obstacles, margin)
      if (collisions < bestCollisions) {
        best = candidate
        bestCollisions = collisions
      }
      if (collisions === 0) {
        return candidate
      }
    }
  }

  return best
}
