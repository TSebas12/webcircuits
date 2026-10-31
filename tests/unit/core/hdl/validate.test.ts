import { describe, it, expect } from 'vitest'
import { parseHdl } from '../../../../src/core/hdl/parser'
import { validateHdlModule } from '../../../../src/core/hdl/validate'

describe('M9-05 · validación HDL', () => {
  it('módulo válido', () => {
    const mod = parseHdl('CHIP And { IN a, b; OUT out; PARTS: and(a=a,b=b,out=out); }')
    expect(validateHdlModule(mod).valid).toBe(true)
  })
  it('detecta falta de salidas', () => {
    const mod = { name: 'X', inputs: ['a'], outputs: [], parts: [] }
    const r = validateHdlModule(mod as any)
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('sin salidas')
  })
})