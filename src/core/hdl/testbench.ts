/**
 * Generación básica de testbench Verilog (M9-07).
 */
export function generateTestbench(moduleName: string, inputs: readonly string[], outputs: readonly string[]): string {
  const lines: string[] = []
  lines.push('`timescale 1ns/1ps')
  lines.push(`module ${moduleName}_tb;`)
  lines.push(`  reg ${inputs.join(', ')};`)
  lines.push(`  wire ${outputs.join(', ')};`)
  lines.push(`  ${moduleName} dut (${[...inputs, ...outputs].join(', ')});`)
  lines.push('  initial begin')
  lines.push('    // TODO: vectores de prueba')
  lines.push('    $finish;')
  lines.push('  end')
  lines.push('endmodule')
  return lines.join('\n')
}