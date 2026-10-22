import { describe, expect, it } from 'vitest'
import { busGeometry, busGroupAt, planBusGroup } from '../../../src/app/editor/bus-group'
import type { BusGroup, Id, Wire } from '../../../src/core/model/types'
import { DEFAULT_LAYER_ID } from '../../../src/core/model/types'

function wire(
  id: Id,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: { readonly layerId?: Id; readonly bitWidth?: number } = {},
): Wire {
  return {
    kind: 'wire',
    id,
    circuitId: 'main',
    layerId: options.layerId ?? DEFAULT_LAYER_ID,
    p1: { x: x1, y: y1 },
    p2: { x: x2, y: y2 },
    bitWidth: options.bitWidth ?? 1,
  }
}

function group(wireIds: readonly Id[]): BusGroup {
  return {
    kind: 'busGroup',
    id: 'bus-1',
    circuitId: 'main',
    layerId: DEFAULT_LAYER_ID,
    wireIds,
    collapsed: true,
    name: 'Bus',
  }
}

describe('planBusGroup (M3B-01)', () => {
  it('asigna los bits de arriba abajo en cables horizontales', () => {
    const result = planBusGroup([
      wire('w6', 0, 6, 10, 6),
      wire('w2', 0, 2, 10, 2),
      wire('w4', 0, 4, 10, 4),
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.orientation).toBe('horizontal')
    expect(result.plan.wireIds).toEqual(['w2', 'w4', 'w6'])
    expect(result.plan.layerId).toBe(DEFAULT_LAYER_ID)
  })

  it('asigna los bits de izquierda a derecha en cables verticales', () => {
    const result = planBusGroup([
      wire('w6', 6, 0, 6, 10),
      wire('w2', 2, 0, 2, 10),
      wire('w4', 4, 0, 4, 10),
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.orientation).toBe('vertical')
    expect(result.plan.wireIds).toEqual(['w2', 'w4', 'w6'])
  })

  it('rechaza lo que no se puede plegar sin mentir', () => {
    expect(planBusGroup([wire('a', 0, 0, 4, 0)]).ok).toBe(false)

    const tooMany = Array.from({ length: 33 }, (_, index) => wire(`w${index}`, 0, index, 8, index))
    expect(planBusGroup(tooMany).ok).toBe(false)

    const diagonal = planBusGroup([wire('a', 0, 0, 4, 0), wire('b', 0, 4, 4, 8)])
    expect(diagonal).toEqual({ ok: false, reason: 'not-orthogonal' })

    const mixed = planBusGroup([wire('a', 0, 0, 4, 0), wire('b', 8, 0, 8, 4)])
    expect(mixed).toEqual({ ok: false, reason: 'mixed-orientation' })

    const layers = planBusGroup([
      wire('a', 0, 0, 4, 0, { layerId: 'principal' }),
      wire('b', 0, 4, 4, 4, { layerId: 'layer-1' }),
    ])
    expect(layers).toEqual({ ok: false, reason: 'mixed-layers' })

    const bus = planBusGroup([wire('a', 0, 0, 4, 0, { bitWidth: 2 }), wire('b', 0, 4, 4, 4)])
    expect(bus).toEqual({ ok: false, reason: 'not-single-bit' })

    const zero = planBusGroup([wire('a', 0, 0, 0, 0), wire('b', 0, 4, 4, 4)])
    expect(zero).toEqual({ ok: false, reason: 'zero-length' })
  })

  it('calcula la línea y los codos del bus horizontal', () => {
    const wires = [wire('w2', 0, 2, 10, 2), wire('w4', 2, 4, 8, 4), wire('w6', 0, 6, 10, 6)]
    const geometry = busGeometry(group(['w2', 'w4', 'w6']), wires)

    expect(geometry).not.toBeNull()
    if (geometry === null) return
    expect(geometry.orientation).toBe('horizontal')
    expect(geometry.spine).toEqual({ p1: { x: 0, y: 4 }, p2: { x: 10, y: 4 } })
    // Cada cable de fuera aporta dos codos; el del medio ya está sobre la línea.
    expect(geometry.stubs).toHaveLength(4)
    expect(geometry.stubs).toContainEqual({
      p1: { x: 0, y: 2 },
      p2: { x: 0, y: 4 },
    })
    expect(geometry.stubs).toContainEqual({
      p1: { x: 10, y: 6 },
      p2: { x: 10, y: 4 },
    })
  })

  it('calcula la línea y los codos del bus vertical', () => {
    const wires = [wire('w2', 2, 0, 2, 10), wire('w4', 4, 2, 4, 8), wire('w6', 6, 0, 6, 10)]
    const geometry = busGeometry(group(['w2', 'w4', 'w6']), wires)

    expect(geometry).not.toBeNull()
    if (geometry === null) return
    expect(geometry.orientation).toBe('vertical')
    expect(geometry.spine).toEqual({ p1: { x: 4, y: 0 }, p2: { x: 4, y: 10 } })
    expect(geometry.stubs).toContainEqual({
      p1: { x: 2, y: 0 },
      p2: { x: 4, y: 0 },
    })
  })

  it('no inventa un bus si falta un cable o una punta lo dejó en diagonal', () => {
    expect(busGeometry(group(['w2', 'w4']), [wire('w2', 0, 2, 10, 2)])).toBeNull()
    expect(
      busGeometry(group(['w2', 'w4']), [wire('w2', 0, 2, 10, 2), wire('w4', 0, 4, 10, 8)]),
    ).toBeNull()
  })

  it('acierta la línea y los codos, no el hueco entre cables', () => {
    const wires = [wire('w2', 0, 2, 10, 2), wire('w6', 0, 6, 10, 6)]
    const groups = [group(['w2', 'w6'])]

    expect(busGroupAt(groups, wires, { x: 5, y: 4 })?.id).toBe('bus-1')
    expect(busGroupAt(groups, wires, { x: 0, y: 3 })?.id).toBe('bus-1')
    expect(busGroupAt(groups, wires, { x: 5, y: 0 })).toBeNull()
  })
})
