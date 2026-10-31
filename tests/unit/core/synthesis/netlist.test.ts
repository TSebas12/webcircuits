import { describe, it, expect } from 'vitest'
import { booleanFunction } from '../../../../src/core/synthesis/function'
import { synthesizeNetlist } from '../../../../src/core/synthesis/netlist'

describe('M8B-03 · síntesis a red', () => {
  it('AND de 2 bits: una AND', () => {
    const fn = booleanFunction(2, [0, 0, 0, 1], ['A', 'B'])
    const nl = synthesizeNetlist(fn)
    expect(nl.nodes.some((n) => n.kind === 'and')).toBe(true)
    expect(nl.outputNodeId).toBe('out')
  })

  it('OR de 2 bits: una OR', () => {
    const fn = booleanFunction(2, [0, 1, 1, 1], ['A', 'B'])
    const nl = synthesizeNetlist(fn)
    expect(nl.nodes.some((n) => n.kind === 'or')).toBe(true)
  })

  it('constante 0 y 1', () => {
    expect(synthesizeNetlist(booleanFunction(2, [0, 0, 0, 0])).nodes.find((n) => n.id === 'out')?.value).toBe(0)
    expect(synthesizeNetlist(booleanFunction(2, [1, 1, 1, 1])).nodes.find((n) => n.id === 'out')?.value).toBe(1)
  })

  it('XOR produce NOTs y ANDs y OR', () => {
    const fn = booleanFunction(2, [0, 1, 1, 0], ['A', 'B'])
    const nl = synthesizeNetlist(fn)
    expect(nl.nodes.filter((n) => n.kind === 'not').length).toBeGreaterThanOrEqual(2)
    expect(nl.nodes.some((n) => n.kind === 'or')).toBe(true)
  })

  it('modo no estándar aún no implementado', () => {
    const fn = booleanFunction(2, [0, 0, 0, 1], ['A', 'B'])
    expect(() => synthesizeNetlist(fn, undefined, { mode: 'nand-only' })).toThrow()
  })
})