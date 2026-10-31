import { describe, it, expect } from 'vitest'
import { booleanFunction } from '../../../../src/core/synthesis/function'
import { synthesizeNetlist } from '../../../../src/core/synthesis/netlist'
import { verifyNetlist } from '../../../../src/core/synthesis/verify'

describe('M8B-06 · verificación', () => {
  it('un netlist correcto verifica', () => {
    const fn = booleanFunction(2, [0, 1, 1, 1], ['A', 'B'])
    const nl = synthesizeNetlist(fn)
    const r = verifyNetlist(fn, nl)
    expect(r.equivalent).toBe(true)
    expect(r.mismatches).toEqual([])
  })

  it('XOR verifica', () => {
    const fn = booleanFunction(2, [0, 1, 1, 0], ['A', 'B'])
    const nl = synthesizeNetlist(fn)
    expect(verifyNetlist(fn, nl).equivalent).toBe(true)
  })

  it('constante verifica', () => {
    const fn = booleanFunction(2, [0, 0, 0, 0])
    const nl = synthesizeNetlist(fn)
    expect(verifyNetlist(fn, nl).equivalent).toBe(true)
  })
})