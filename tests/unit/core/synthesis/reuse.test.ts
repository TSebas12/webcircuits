import { describe, it, expect } from 'vitest'
import { booleanFunction } from '../../../../src/core/synthesis/function'
import { findEquivalentSubcircuit, functionsEquivalent } from '../../../../src/core/synthesis/reuse'

describe('M8B-04 · reutilizar subcircuitos', () => {
  it('funciones idénticas son equivalentes', () => {
    const a = booleanFunction(2, [0, 0, 0, 1], ['A', 'B'])
    const b = booleanFunction(2, [0, 0, 0, 1], ['X', 'Y'])
    expect(functionsEquivalent(a, b)).toBe(true)
  })

  it('funciones distintas no lo son', () => {
    const a = booleanFunction(2, [0, 0, 0, 1])
    const b = booleanFunction(2, [0, 1, 1, 1])
    expect(functionsEquivalent(a, b)).toBe(false)
  })

  it('reusa si existe equivalente', () => {
    const target = booleanFunction(2, [0, 1, 1, 1])
    const existing = [
      { id: 'circ-and', function: booleanFunction(2, [0, 0, 0, 1]) },
      { id: 'circ-or', function: booleanFunction(2, [0, 1, 1, 1]) },
    ]
    expect(findEquivalentSubcircuit(existing, target)).toBe('circ-or')
  })

  it('null si no hay equivalente', () => {
    const target = booleanFunction(2, [0, 1, 0, 1])
    expect(findEquivalentSubcircuit([], target)).toBeNull()
  })
})