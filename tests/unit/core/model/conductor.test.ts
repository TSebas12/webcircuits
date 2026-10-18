import { describe, expect, it } from 'vitest'
import { Conductor, ConductorMap } from '../../../../src/core/model/conductor'

describe('ConductorMap (port de ConductorMapTest.cs)', () => {
  it('vacío: ningún conductor', () => {
    const map = new ConductorMap([])
    expect(map.conductors.length).toBe(0)
  })

  it('un cable: un conductor con ese cable', () => {
    const wire = { p1: { x: 1, y: 2 }, p2: { x: 3, y: 4 } }
    const map = new ConductorMap([wire])

    expect(map.conductors.length).toBe(1)
    const conductor = map.tryGetValue({ x: 3, y: 4 })
    expect(conductor).toBeDefined()
    expect(conductor!.wires.length).toBe(1)
    expect(conductor!.wires[0]).toBe(wire)
  })

  it('dos cables que comparten un punto: un solo conductor con los dos', () => {
    const wire1 = { p1: { x: 1, y: 2 }, p2: { x: 3, y: 4 } }
    const wire2 = { p1: { x: 5, y: 6 }, p2: { x: 3, y: 4 } }
    const map = new ConductorMap([wire1, wire2])

    expect(map.conductors.length).toBe(1)
    const conductor = map.tryGetValue({ x: 3, y: 4 })
    expect(conductor).toBeDefined()
    expect(conductor!.wires.length).toBe(2)
    expect(conductor!.points.length).toBe(3)
  })

  it('dos cables sin compartir punto: dos conductores', () => {
    const wire1 = { p1: { x: 1, y: 2 }, p2: { x: 3, y: 4 } }
    const wire2 = { p1: { x: 5, y: 6 }, p2: { x: 7, y: 8 } }
    const map = new ConductorMap([wire1, wire2])

    expect(map.conductors.length).toBe(2)

    const c1 = map.tryGetValue({ x: 3, y: 4 })
    expect(c1).toBeDefined()
    expect(c1!.wires.length).toBe(1)
    expect(c1!.points.length).toBe(2)

    // El segundo cable no comparte el punto (3, 4); el original pide buscarlo por su propio extremo.
    const c2 = map.tryGetValue({ x: 7, y: 8 })
    expect(c2).toBeDefined()
    expect(c2!.wires.length).toBe(1)
    expect(c2!.points.length).toBe(2)
  })

  it('tres cables que se unen por el camino: un solo conductor con los tres', () => {
    const wire1 = { p1: { x: 1, y: 2 }, p2: { x: 3, y: 4 } }
    const wire2 = { p1: { x: 5, y: 6 }, p2: { x: 7, y: 8 } }
    const map0 = new ConductorMap([wire1, wire2])
    expect(map0.conductors.length).toBe(2)

    const wire3 = { p1: { x: 5, y: 6 }, p2: { x: 1, y: 2 } }
    const map = new ConductorMap([wire1, wire2, wire3])

    expect(map.conductors.length).toBe(1)
    const conductor = map.tryGetValue({ x: 7, y: 8 })
    expect(conductor).toBeDefined()
    expect(conductor!.wires.length).toBe(3)
    expect(conductor!.points.length).toBe(4)
  })

  it('unión: 3 o más extremos en un punto', () => {
    const wire1 = { p1: { x: 1, y: 2 }, p2: { x: 3, y: 4 } }
    const wire2 = { p1: { x: 5, y: 6 }, p2: { x: 3, y: 4 } }
    const wire3 = { p1: { x: 7, y: 8 }, p2: { x: 3, y: 4 } }
    const map = new ConductorMap([wire1, wire2, wire3])

    expect(map.junctionCount({ x: 3, y: 4 })).toBe(3)
    const junctions = [...map.junctionPoints(3)]
    expect(junctions).toContainEqual({ x: 3, y: 4 })
  })
})

describe('Conductor', () => {
  it('Add devuelve false si el cable ya estaba', () => {
    const c = new Conductor()
    const wire = { p1: { x: 1, y: 2 }, p2: { x: 3, y: 4 } }
    expect(c.add(wire)).toBe(true)
    expect(c.add(wire)).toBe(false)
    expect(c.wires.length).toBe(1)
  })

  it('Contains por punto y por cable', () => {
    const c = new Conductor()
    const wire = { p1: { x: 1, y: 2 }, p2: { x: 3, y: 4 } }
    c.add(wire)
    expect(c.contains({ x: 1, y: 2 })).toBe(true)
    expect(c.contains({ x: 9, y: 9 })).toBe(false)
    expect(c.contains(wire)).toBe(true)
  })
})