import { describe, it, expect } from 'vitest'
import { generateTestbench } from '../../../../src/core/hdl/testbench'
describe('M9-07', () => {
  it('genera testbench', () => {
    const t = generateTestbench('foo', ['a', 'b'], ['out'])
    expect(t).toContain('module foo_tb;')
    expect(t).toContain('foo dut')
    expect(t).toContain('endmodule')
  })
})