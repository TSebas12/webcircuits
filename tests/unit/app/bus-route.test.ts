import { describe, expect, it } from 'vitest'
import { busGeometry } from '../../../src/app/editor/bus-group'
import { moveBusSpine, routeBusGeometry, spineCross } from '../../../src/app/editor/bus-route'
import type { BusGroup, GridPoint, Wire } from '../../../src/core/model/types'

function wire(id: string, p1: GridPoint, p2: GridPoint): Wire {
  return {
    kind: 'wire',
    id,
    circuitId: 'main',
    layerId: 'principal',
    bitWidth: 1,
    p1,
    p2,
  }
}

function bus(wireIds: readonly string[]): BusGroup {
  return {
    kind: 'busGroup',
    id: 'bus',
    circuitId: 'main',
    layerId: 'principal',
    wireIds,
    collapsed: true,
    name: 'Bus 2',
  }
}

function horizontal() {
  const group = bus(['w1', 'w2'])
  const wires = [
    wire('w1', { x: 0, y: 2 }, { x: 10, y: 2 }),
    wire('w2', { x: 0, y: 8 }, { x: 10, y: 8 }),
  ]
  const geometry = busGeometry(group, wires)
  if (geometry === null) throw new Error('geometría horizontal inválida')
  return geometry
}

function vertical() {
  const group = bus(['w1', 'w2'])
  const wires = [
    wire('w1', { x: 2, y: 0 }, { x: 2, y: 10 }),
    wire('w2', { x: 8, y: 0 }, { x: 8, y: 10 }),
  ]
  const geometry = busGeometry(group, wires)
  if (geometry === null) throw new Error('geometría vertical inválida')
  return geometry
}

describe('rutado automático de buses (M3B-02)', () => {
  it('sin obstáculos deja la línea en la mediana', () => {
    const geometry = horizontal()
    expect(spineCross(geometry)).toBe(5)
    expect(routeBusGeometry(geometry, [])).toBe(geometry)
  })

  it('mueve la línea al canal libre más cercano sin mover las puntas de los cables', () => {
    const geometry = horizontal()
    const routed = routeBusGeometry(geometry, [{ x0: 4, y0: 4.5, x1: 6, y1: 5.5 }])

    expect(spineCross(routed)).toBe(6)
    expect(routed.spine.p1).toEqual({ x: 0, y: 6 })
    expect(routed.spine.p2).toEqual({ x: 10, y: 6 })
    // Los codos siguen empezando en la punta del cable; solo se mueve su final en la línea.
    expect(routed.stubs[0]?.p1).toEqual(geometry.stubs[0]?.p1)
    expect(routed.stubs[0]?.p2.y).toBe(6)
  })

  it('salta un obstáculo alto y también funciona en vertical', () => {
    const horizontalBus = horizontal()
    const routed = routeBusGeometry(horizontalBus, [{ x0: 4, y0: 3.5, x1: 6, y1: 6.5 }])
    expect(spineCross(routed)).toBe(7)

    const verticalBus = vertical()
    expect(spineCross(verticalBus)).toBe(5)
    const verticalRouted = routeBusGeometry(verticalBus, [{ x0: 4.5, y0: 4, x1: 5.5, y1: 6 }])
    expect(spineCross(verticalRouted)).toBe(6)
    expect(verticalRouted.spine.p1).toEqual({ x: 6, y: 0 })
  })

  it('si no hay canal dentro del límite se queda con el menos malo', () => {
    const geometry = horizontal()
    const routed = routeBusGeometry(geometry, [{ x0: 4, y0: 3.5, x1: 6, y1: 6.5 }], {
      maxOffset: 1,
    })

    expect(routed).toBe(geometry)
  })

  it('moveBusSpine conserva los codos unidos a los cables', () => {
    const geometry = horizontal()
    const moved = moveBusSpine(geometry, 9)

    expect(moved.spine.p1.y).toBe(9)
    // Cada cable aporta dos codos (una por punta); todos acaban en la nueva línea.
    expect(moved.stubs.filter((stub) => stub.p1.y === 2).every((stub) => stub.p2.y === 9)).toBe(
      true,
    )
    expect(moved.stubs.filter((stub) => stub.p1.y === 8).every((stub) => stub.p2.y === 9)).toBe(
      true,
    )
    expect(moved.stubs.some((stub) => stub.p1.y === 2)).toBe(true)
    expect(moved.stubs.some((stub) => stub.p1.y === 8)).toBe(true)
  })
})
