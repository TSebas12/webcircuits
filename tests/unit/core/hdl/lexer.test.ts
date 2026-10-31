import { describe, it, expect } from 'vitest'
import { tokenizeHdl } from '../../../../src/core/hdl/lexer'

describe('M9-01 · lexer HDL', () => {
  it('tokeniza un chip mínimo', () => {
    const tokens = tokenizeHdl('CHIP Foo { IN a; OUT b; PARTS: /*x*/ }')
    const types = tokens.map((t) => t.type)
    expect(types).toContain('CHIP')
    expect(types).toContain('IDENTIFIER')
    expect(types).toContain('PARTS')
    expect(types).not.toContain('NUMBER')
  })

  it('salta comentarios y espacios', () => {
    const tokens = tokenizeHdl('// c\nCHIP X { }')
    expect(tokens.filter((t) => t.type === 'CHIP').length).toBe(1)
  })

  it('números y bits', () => {
    const tokens = tokenizeHdl('a[0..2]')
    expect(tokens.map((t) => t.type)).toEqual(['IDENTIFIER', 'OPEN_BIT', 'NUMBER', 'ELAPSE', 'NUMBER', 'CLOSE_BIT', 'EOF'])
  })
})