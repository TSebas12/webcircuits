/**
 * Agrupar cables en un bus (M3B-01).
 *
 * Un bus **no** es un cable ancho más: es un grupo de cables de un bit que se dibuja como una
 * sola línea. Los cables siguen existiendo y siguen siendo los que simulan; el grupo solo
 * ahorra ruido visual. Esa decisión es la que hace posible el resto de M3B: plegar y desplegar
 * (M3B-04), etiquetar el rango (M3B-03) y mirar los bits uno a uno (M3B-06).
 *
 * Aquí está la lógica pura: ordenar los cables, asignarles un bit, calcular la línea que los
 * representa y decir si el cursor está encima. El editor solo pone y quita grupos del
 * documento. Así se puede probar sin lienzo ni Svelte.
 */

import type { BusGroup, GridPoint, Id, Wire } from '../../core/model/types'
import { MAX_BIT_WIDTH } from '../../core/model/types'
import { distanceToSegment } from '../../render/hit-test'

/** Cómo están orientados los cables del grupo. */
export type BusOrientation = 'horizontal' | 'vertical'

/** Por qué no se puede agrupar una selección. La interfaz no lo enseña todavía; los tests sí. */
export type BusGroupError =
  | 'too-few'
  | 'too-many'
  | 'not-single-bit'
  | 'zero-length'
  | 'not-orthogonal'
  | 'mixed-orientation'
  | 'mixed-layers'
  | 'duplicate'

/** Lo que hay que escribir en el documento para crear el grupo. */
export interface BusGroupPlan {
  /** Cables en orden de bit: índice 0 = bit 0. */
  readonly wireIds: readonly Id[]
  readonly layerId: Id
  readonly name: string
  readonly orientation: BusOrientation
}

export type BusGroupPlanResult =
  | { readonly ok: true; readonly plan: BusGroupPlan }
  | { readonly ok: false; readonly reason: BusGroupError }

/** Un tramo recto del dibujo del bus, en coordenadas de rejilla. */
export interface BusSegment {
  readonly p1: GridPoint
  readonly p2: GridPoint
}

/** Lo que se acertó al pulsar sobre un bus plegado. */
export interface BusGroupHit {
  readonly kind: 'bus'
  readonly group: BusGroup
}

/**
 * La geometría con la que se pinta un grupo plegado.
 *
 * `spine` es la línea gruesa del bus y `stubs` los codos cortos que la unen con las puntas de
 * cada cable. Los cables originales quedan ocultos mientras el grupo está plegado.
 */
export interface BusGeometry {
  readonly orientation: BusOrientation
  readonly spine: BusSegment
  readonly stubs: readonly BusSegment[]
}

interface OrientedWire {
  readonly wire: Wire
  /** Coordenada fija: `y` en horizontal, `x` en vertical. */
  readonly cross: number
  /** Extremos en el eje largo, ya normalizados (`start` <= `end`). */
  readonly start: number
  readonly end: number
}

function orientationOf(wire: Wire): BusOrientation | null {
  if (wire.p1.x === wire.p2.x && wire.p1.y === wire.p2.y) {
    return null
  }
  if (wire.p1.y === wire.p2.y) {
    return 'horizontal'
  }
  if (wire.p1.x === wire.p2.x) {
    return 'vertical'
  }
  return null
}

function asOriented(wire: Wire, orientation: BusOrientation): OrientedWire {
  if (orientation === 'horizontal') {
    return {
      wire,
      cross: wire.p1.y,
      start: Math.min(wire.p1.x, wire.p2.x),
      end: Math.max(wire.p1.x, wire.p2.x),
    }
  }
  return {
    wire,
    cross: wire.p1.x,
    start: Math.min(wire.p1.y, wire.p2.y),
    end: Math.max(wire.p1.y, wire.p2.y),
  }
}

function compareId(a: Id, b: Id): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Ordena los cables de un grupo y asigna los bits.
 *
 * Horizontal: de arriba abajo (el de arriba es el bit 0). Vertical: de izquierda a derecha.
 * Los empates se rompen por la posición del extremo y, si hace falta, por el identificador, para
 * que dos grupos con la misma geometría salgan siempre igual.
 */
function compareOriented(a: OrientedWire, b: OrientedWire): number {
  if (a.cross !== b.cross) return a.cross - b.cross
  if (a.start !== b.start) return a.start - b.start
  if (a.end !== b.end) return a.end - b.end
  return compareId(a.wire.id, b.wire.id)
}

/**
 * Decide si una selección se puede convertir en bus y en qué orden van sus bits.
 *
 * Solo se agrupan cables simples (1 bit), ortogonales y del mismo tipo. Los grupos de cables en
 * diagonal o mezclando horizontales y verticales quedan para M3B-02, que es donde hay rutado
 * automático; fingir que se pueden plegar ahora daría un dibujo mentiroso.
 */
export function planBusGroup(wires: readonly Wire[]): BusGroupPlanResult {
  if (wires.length < 2) {
    return { ok: false, reason: 'too-few' }
  }
  if (wires.length > MAX_BIT_WIDTH) {
    return { ok: false, reason: 'too-many' }
  }

  const ids = new Set<Id>()
  const layerId = wires[0]?.layerId
  let orientation: BusOrientation | null = null

  for (const wire of wires) {
    if (ids.has(wire.id)) {
      return { ok: false, reason: 'duplicate' }
    }
    ids.add(wire.id)

    if (wire.layerId !== layerId) {
      return { ok: false, reason: 'mixed-layers' }
    }
    if (wire.bitWidth !== 1) {
      return { ok: false, reason: 'not-single-bit' }
    }

    const current = orientationOf(wire)
    if (current === null) {
      // Un cable de longitud cero no tiene orientación y no aporta ningún bit visible.
      return {
        ok: false,
        reason:
          wire.p1.x === wire.p2.x && wire.p1.y === wire.p2.y ? 'zero-length' : 'not-orthogonal',
      }
    }
    if (orientation === null) {
      orientation = current
    } else if (orientation !== current) {
      return { ok: false, reason: 'mixed-orientation' }
    }
  }

  if (orientation === null || layerId === undefined) {
    return { ok: false, reason: 'too-few' }
  }

  const ordered = wires.map((wire) => asOriented(wire, orientation)).sort(compareOriented)

  return {
    ok: true,
    plan: {
      wireIds: ordered.map((item) => item.wire.id),
      layerId,
      name: `Bus ${ordered.length}`,
      orientation,
    },
  }
}

/** La mediana redondeada de una lista de coordenadas. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0
  }
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
}

function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`
}

/**
 * Calcula la línea del bus y los codos que la unen a cada cable.
 *
 * Devuelve `null` si el grupo ya no se puede dibujar (por ejemplo, porque alguien movió una
 * punta y dejó un cable en diagonal). En ese caso el editor enseña los cables individuales en
 * vez de inventarse un bus.
 */
export function busGeometry(group: BusGroup, wires: readonly Wire[]): BusGeometry | null {
  const byId = new Map(wires.map((wire) => [wire.id, wire]))
  const members: Wire[] = []
  for (const id of group.wireIds) {
    const wire = byId.get(id)
    if (wire === undefined) {
      return null
    }
    members.push(wire)
  }

  const result = planBusGroup(members)
  if (!result.ok) {
    return null
  }

  const orientation = result.plan.orientation
  const oriented = members.map((wire) => asOriented(wire, orientation))
  const spineCross = median(oriented.map((item) => item.cross))
  const alongStart = Math.min(...oriented.map((item) => item.start))
  const alongEnd = Math.max(...oriented.map((item) => item.end))

  const spine: BusSegment =
    orientation === 'horizontal'
      ? { p1: { x: alongStart, y: spineCross }, p2: { x: alongEnd, y: spineCross } }
      : { p1: { x: spineCross, y: alongStart }, p2: { x: spineCross, y: alongEnd } }

  const stubs: BusSegment[] = []
  const seen = new Set<string>()
  for (const item of oriented) {
    if (item.cross === spineCross) {
      continue
    }
    for (const along of [item.start, item.end]) {
      const point =
        orientation === 'horizontal' ? { x: along, y: spineCross } : { x: spineCross, y: along }
      // La clave lleva también la punta de origen: dos cables del mismo lado pueden compartir
      // el punto donde tocan la línea, pero cada uno necesita su codo hasta su altura.
      const key = `${pointKey(point)}:${item.cross}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      stubs.push({
        p1:
          orientation === 'horizontal' ? { x: along, y: item.cross } : { x: item.cross, y: along },
        p2: point,
      })
    }
  }

  return { orientation, spine, stubs }
}

/** Un bus ya resuelto: el grupo y la geometría que le toca. */
export interface FoldedBus {
  readonly group: BusGroup
  readonly geometry: BusGeometry
}

/**
 * ¿Qué bus plegado hay bajo el cursor?
 *
 * Se comprueba la línea gruesa y los codos. Gana el más cercano, igual que en el hit-test de
 * cables. El editor llama a esto solo si no hay un pin o un símbolo delante, y le pasa los
 * buses que ya resolvió para no recalcular la geometría en cada movimiento del ratón.
 */
export function busGroupAtFolded(
  folded: readonly FoldedBus[],
  world: GridPoint,
  radius = 0.3,
): BusGroup | null {
  let best: BusGroup | null = null
  let bestDistance = radius

  for (const { group, geometry } of folded) {
    const segments = [geometry.spine, ...geometry.stubs]
    for (const segment of segments) {
      const distance = distanceToSegment(world, segment.p1, segment.p2)
      if (distance <= bestDistance) {
        bestDistance = distance
        best = group
      }
    }
  }

  return best
}

/**
 * ¿Qué bus hay bajo el cursor?
 *
 * Se comprueba la línea gruesa y los codos. Gana el más cercano, igual que en el hit-test de
 * cables. El editor llama a esto solo si no hay un pin o un símbolo delante.
 */
export function busGroupAt(
  groups: readonly BusGroup[],
  wires: readonly Wire[],
  world: GridPoint,
  radius = 0.3,
): BusGroup | null {
  const folded: FoldedBus[] = []
  for (const group of groups) {
    const geometry = busGeometry(group, wires)
    if (geometry !== null) {
      folded.push({ group, geometry })
    }
  }
  return busGroupAtFolded(folded, world, radius)
}
