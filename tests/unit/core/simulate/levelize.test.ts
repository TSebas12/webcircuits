import { describe, expect, it } from 'vitest'
import { levelize } from '../../../../src/core/simulate/levelize'
import type { Element } from '../../../../src/core/model/types'

describe('levelize (M2-10)', () => {
  it('un circuito vacío no produce orden', () => {
    expect(levelize([])).toEqual([])
  })

  it('un solo interruptor va primero', () => {
    const elements = [
      {
        kind: 'button',
        id: 'b1',
        circuitId: 'main',
        layerId: 'principal',
        position: { x: 0, y: 0 },
        rotation: 'up',
        isToggle: false,
        inverted: false,
      } as unknown as Element,
    ]
    const order = levelize(elements)
    expect(order.map((d) => d.id)).toEqual(['b1'])
  })

  it('una AND con dos interruptores: los interruptores primero, luego la AND', () => {
    const elements = [
      {
        kind: 'button',
        id: 'b1',
        circuitId: 'main',
        layerId: 'principal',
        position: { x: 0, y: 0 },
        rotation: 'up',
        isToggle: false,
        inverted: false,
      } as unknown as Element,
      {
        kind: 'button',
        id: 'b2',
        circuitId: 'main',
        layerId: 'principal',
        position: { x: 0, y: 2 },
        rotation: 'up',
        isToggle: false,
        inverted: false,
      } as unknown as Element,
      {
        kind: 'gate',
        id: 'g1',
        circuitId: 'main',
        layerId: 'principal',
        position: { x: 4, y: 1 },
        rotation: 'up',
        gateType: 'and',
        inputCount: 2,
        invertedOutput: false,
      } as unknown as Element,
      {
        kind: 'wire',
        id: 'w1',
        circuitId: 'main',
        layerId: 'principal',
        p1: { x: 2, y: 0 },
        p2: { x: 4, y: 1 },
        bitWidth: 1,
      } as unknown as Element,
      {
        kind: 'wire',
        id: 'w2',
        circuitId: 'main',
        layerId: 'principal',
        p1: { x: 2, y: 2 },
        p2: { x: 4, y: 2 },
        bitWidth: 1,
      } as unknown as Element,
    ]
    const order = levelize(elements).map((d) => d.id)
    expect(order.indexOf('b1')).toBeLessThan(order.indexOf('g1'))
    expect(order.indexOf('b2')).toBeLessThan(order.indexOf('g1'))
  })
})
