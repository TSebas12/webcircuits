import { describe, it, expect } from 'vitest'
import {
  booleanFunction,
  combinationCount,
  isConstantOne,
  isConstantZero,
  mintermExpression,
  sumOfProducts,
} from '../../../../src/core/synthesis/function'

describe('M8B-01 · función lógica', () => {
  it('cuenta combinaciones', () => {
    expect(combinationCount(0)).toBe(1)
    expect(combinationCount(2)).toBe(4)
    expect(combinationCount(3)).toBe(8)
  })

  it('extrae minterms y maxterms de una AND de 2 bits', () => {
    // tabla: 00->0, 01->0, 10->0, 11->1
    const fn = booleanFunction(2, [0, 0, 0, 1])
    expect(fn.minterms).toEqual([3])
    expect(fn.maxterms).toEqual([0, 1, 2])
    expect(fn.inputNames).toEqual(['x1', 'x2'])
  })

  it('acepta nombres de entrada y salida', () => {
    const fn = booleanFunction(2, [0, 1, 1, 1], ['a', 'b'], 'y')
    expect(fn.inputNames).toEqual(['a', 'b'])
    expect(fn.outputName).toBe('y')
    expect(fn.minterms).toEqual([1, 2, 3])
  })

  it('trata null/undefined como don\'t care', () => {
    const fn = booleanFunction(2, [0, null, 1, undefined])
    expect(fn.minterms).toEqual([2])
    expect(fn.maxterms).toEqual([0])
    expect(fn.dontCares).toEqual([1, 3])
  })

  it('identifica constantes', () => {
    expect(isConstantZero(booleanFunction(1, [0, 0]))).toBe(true)
    expect(isConstantOne(booleanFunction(1, [1, 1]))).toBe(true)
  })

  it('expresa minterms y suma de productos', () => {
    expect(mintermExpression(3, 2, ['A', 'B'])).toBe("AB")
    expect(mintermExpression(0, 2, ['A', 'B'])).toBe("A'B'")
    expect(sumOfProducts(booleanFunction(2, [0, 1, 1, 1], ['A', 'B']))).toBe("A'B + AB' + AB")
  })

  it('valida la longitud de salidas', () => {
    expect(() => booleanFunction(2, [0, 0])).toThrow()
    expect(() => booleanFunction(-1, [0])).toThrow()
  })
})