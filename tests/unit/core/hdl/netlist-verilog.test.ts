import { describe, it, expect } from 'vitest'
import { booleanFunction } from '../../../../src/core/synthesis/function'
import { synthesizeNetlist } from '../../../../src/core/synthesis/netlist'
import { netlistToVerilog } from '../../../../src/core/hdl/netlist-verilog'

describe('M9-04b · netlist a Verilog', () => {
  it('genera módulo AND', () => {
    const fn = booleanFunction(2, [0, 0, 0, 1], ['a', 'b'])
    const nl = synthesizeNetlist(fn)
    const v = netlistToVerilog(nl)
    expect(v).toContain('module synthesized')
    expect(v).toContain('and ')
    expect(v).toContain('endmodule')
  })
})