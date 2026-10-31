import { describe, it, expect } from 'vitest'
import { parseHdl } from '../../../../src/core/hdl/parser'
import { generateVerilog, sanitizeVerilogName } from '../../../../src/core/hdl/verilog'

describe('M9-03 · Verilog', () => {
  it('sanitize nombres', () => {
    expect(sanitizeVerilogName('foo-bar')).toBe('foo_bar')
    expect(sanitizeVerilogName('1abc')).toBe('_1abc')
    expect(sanitizeVerilogName('module')).toBe('module_')
  })
  it('genera un módulo', () => {
    const mod = parseHdl('CHIP And { IN a, b; OUT out; PARTS: and(a=a, b=b, out=out); }')
    const v = generateVerilog(mod)
    expect(v).toContain('module And (a, b, out);')
    expect(v).toContain('input a, b;')
    expect(v).toContain('output out;')
    expect(v).toContain('and and_inst (.a(a), .b(b), .out(out));')
    expect(v).toContain('endmodule')
  })
})