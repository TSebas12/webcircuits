/**
 * Qué hay bajo el cursor (M1-09).
 *
 * Trabaja en **coordenadas de mundo** (unidades de rejilla), así que no sabe nada de
 * píxeles ni de zoom: da igual a qué distancia esté uno acercado. Quien llama traduce el
 * clic con la cámara.
 *
 * El orden de búsqueda importa y es el mismo que el del original: **primero los pines**,
 * porque viven justo encima del borde de la caja del símbolo y, si se mirara antes el
 * rectángulo, nunca se podrían agarrar.
 *
 * Se devuelve el primer acierto, no todos: el editor solo necesita uno.
 */

import { deviceBounds, placedPins, type CircuitResolver } from '../core/model/layout'
import type { DrawableDevice, Element, GridPoint, Wire } from '../core/model/types'
import type { WorldPoint } from './camera'

/**
 * Radio de acierto de un pin, en unidades de rejilla.
 *
 * El original usa los 6 px de la marca del pin (`Symbol.PinRadius = 3`), que son 0,33
 * unidades. Aquí se redondea un poco hacia arriba: acertar un pin tiene que ser fácil,
 * que para eso es la operación más repetida al cablear.
 */
const PIN_HIT_RADIUS = 0.4

/** Distancia máxima a un cable para considerarlo acertado, en unidades de rejilla. */
const WIRE_HIT_RADIUS = 0.3

/** Se acertó un dispositivo (y no uno de sus pines). */
export interface DeviceHit {
  readonly kind: 'device'
  readonly element: DrawableDevice
}

/** Se acertó un pin concreto. */
export interface PinHit {
  readonly kind: 'pin'
  readonly element: DrawableDevice
  /** Posición del pin en la rejilla. */
  readonly point: GridPoint
}

/** Se acertó un cable. */
export interface WireHit {
  readonly kind: 'wire'
  readonly element: Wire
  /** El punto del cable más cercano al cursor, redondeado a la rejilla. */
  readonly point: GridPoint
}

export type Hit = DeviceHit | PinHit | WireHit

export function hitTest(
  elements: readonly Element[],
  world: WorldPoint,
  resolveCircuit?: CircuitResolver,
): Hit | null {
  const pin = findPin(elements, world, resolveCircuit)
  if (pin !== null) {
    return pin
  }

  const device = findDevice(elements, world, resolveCircuit)
  if (device !== null) {
    return device
  }

  return findWire(elements, world)
}

function findPin(
  elements: readonly Element[],
  world: WorldPoint,
  resolveCircuit?: CircuitResolver,
): PinHit | null {
  let best: PinHit | null = null
  let bestDistance = PIN_HIT_RADIUS

  for (const element of elements) {
    if (element.kind === 'wire') {
      continue
    }
    for (const placed of placedPins(element, resolveCircuit)) {
      const distance = Math.hypot(placed.point.x - world.x, placed.point.y - world.y)
      if (distance <= bestDistance) {
        bestDistance = distance
        best = { kind: 'pin', element, point: placed.point }
      }
    }
  }

  return best
}

function findDevice(
  elements: readonly Element[],
  world: WorldPoint,
  resolveCircuit?: CircuitResolver,
): DeviceHit | null {
  // Al revés: lo último colocado está encima, y debe ganar.
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index]
    if (element === undefined || element.kind === 'wire') {
      continue
    }
    const box = deviceBounds(element, resolveCircuit)
    if (world.x >= box.x0 && world.x <= box.x1 && world.y >= box.y0 && world.y <= box.y1) {
      return { kind: 'device', element }
    }
  }
  return null
}

function findWire(elements: readonly Element[], world: WorldPoint): WireHit | null {
  let best: WireHit | null = null
  let bestDistance = WIRE_HIT_RADIUS

  for (const element of elements) {
    if (element.kind !== 'wire') {
      continue
    }
    const distance = distanceToSegment(world, element.p1, element.p2)
    if (distance <= bestDistance) {
      bestDistance = distance
      best = { kind: 'wire', element, point: nearestPointOnSegment(world, element.p1, element.p2) }
    }
  }

  return best
}

/** Distancia de un punto a un segmento. */
export function distanceToSegment(point: WorldPoint, a: GridPoint, b: GridPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y)
  }

  const t = clamp01(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

/** El punto del segmento más cercano al indicado, redondeado a la rejilla. */
export function nearestPointOnSegment(point: WorldPoint, a: GridPoint, b: GridPoint): GridPoint {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return a
  }

  const t = clamp01(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)
  return { x: Math.round(a.x + t * dx), y: Math.round(a.y + t * dy) }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
