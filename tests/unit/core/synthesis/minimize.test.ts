import { describe, it, expect } from 'vitest'
import { booleanFunction } from '../../../../src/core/synthesis/function'
import { minimize } from '../../../../src/core/synthesis/minimize'

describe('M8B-02 · minimización', () => {
  it('AND de 2 bits no se minimiza más', () => {
    const fn = booleanFunction(2, [0, 0, 0, 1], ['A', 'B'])
    const m = minimize(fn)
    expect(m.expression).toBe("AB")
    expect(m.implicants.length).toBe(1)
  })

  it('OR de 2 bits', () => {
    const fn = booleanFunction(2, [0, 1, 1, 1], ['A', 'B'])
    const m = minimize(fn)
    expect(m.expression).toBe("B + A") // maybe order?
  })

  it('función con don\'t care se minimiza', () => {
    // f(A,B)= 1 para 01 y 11, don't care en 10 → A
    const fn = booleanFunction(2, [0, 1, null, 1], ['A', 'B'])
    const m = minimize(fn)
    expect(m.expression).toBe("B")
  })

  it('constante 0 y 1', () => {
    expect(minimize(booleanFunction(2, [0, 0, 0, 0])).expression).toBe('0')
    expect(minimize(booleanFunction(2, [1, 1, 1, 1])).expression).toBe('1')
  })

  it('XOR de 2 bits no se puede reducir', () => {
    const fn = booleanFunction(2, [0, 1, 1, 0], ['A', 'B'])
    const m = minimize(fn)
    // dos mintermos → AB' + A'B
    expect(m.implicants.length).toBe(2)
  })
})