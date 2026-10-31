import { describe, it, expect } from 'vitest'
import { parseHdl } from '../../../../src/core/hdl/parser'

describe('M9-02 · parser HDL', () => {
  it('parsea un chip básico', () => {
    const mod = parseHdl(`
      CHIP And {
        IN a, b;
        OUT out;
        PARTS:
          and(a=a, b=b, out=out);
      }
    `)
    expect(mod.name).toBe('And')
    expect(mod.inputs).toEqual(['a', 'b'])
    expect(mod.outputs).toEqual(['out'])
    expect(mod.parts.length).toBe(1)
    const part = mod.parts[0]!
    expect(part.name).toBe('and')
    expect(part.connections).toEqual([
      { name: 'a', value: 'a' },
      { name: 'b', value: 'b' },
      { name: 'out', value: 'out' },
    ])
  })

  it('varios parts', () => {
    const mod = parseHdl('CHIP X { IN a; OUT o; PARTS: not(in=a,out=t); or(a=t,b=a,out=o); }')
    expect(mod.parts.length).toBe(2)
  })
})