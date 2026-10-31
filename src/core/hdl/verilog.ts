/**
 * Generación básica de Verilog a partir de un módulo HDL (M9-03/M9-04).
 *
 * Por ahora emite un esqueleto de módulo (`module … endmodule`) con sus puertos y
 * una lista de instancias primitivas para cada part. Es un primer paso; las
 * conexiones por bits y los subcircuitos llegan en pasos posteriores.
 */

import type { HdlModule } from './parser'

export interface VerilogOptions {
  readonly moduleName?: string
}

export function generateVerilog(mod: HdlModule, _options?: VerilogOptions): string {
  const lines: string[] = []
  const name = _options?.moduleName ?? mod.name
  const ports = [...mod.inputs, ...mod.outputs].join(', ')
  lines.push(`module ${name} (${ports});`)
  if (mod.inputs.length > 0) lines.push(`  input ${mod.inputs.join(', ')};`)
  if (mod.outputs.length > 0) lines.push(`  output ${mod.outputs.join(', ')};`)
  lines.push('')
  for (const part of mod.parts) {
    const conns = part.connections.map((c) => `.${c.name}(${c.value})`).join(', ')
    lines.push(`  ${part.name} ${part.name}_inst (${conns});`)
  }
  lines.push('endmodule')
  return lines.join('\n')
}