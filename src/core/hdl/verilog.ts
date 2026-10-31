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

const INVALID = /\s|[,.?/!@#$%^&*()\-+={}[\]|\\<>~`]/g
const KEYWORDS = new Set([
  'always', 'assign', 'begin', 'end', 'module', 'input', 'output', 'wire', 'reg',
])

export function sanitizeVerilogName(name: string): string {
  let fixed = name.replace(INVALID, '_')
  if (!/^[A-Za-z_]/.test(fixed)) fixed = '_' + fixed
  if (KEYWORDS.has(fixed)) fixed = fixed + '_'
  return fixed
}

export function generateVerilog(mod: HdlModule, options?: VerilogOptions): string {
  const name = sanitizeVerilogName(options?.moduleName ?? mod.name)
  const lines: string[] = []
  const ports = [...mod.inputs, ...mod.outputs].map(sanitizeVerilogName).join(', ')
  lines.push(`module ${name} (${ports});`)
  if (mod.inputs.length > 0) lines.push(`  input ${mod.inputs.map(sanitizeVerilogName).join(', ')};`)
  if (mod.outputs.length > 0) lines.push(`  output ${mod.outputs.map(sanitizeVerilogName).join(', ')};`)
  lines.push('')
  for (const part of mod.parts) {
    const conns = part.connections.map((c) => `.${sanitizeVerilogName(c.name)}(${sanitizeVerilogName(c.value)})`).join(', ')
    lines.push(`  ${sanitizeVerilogName(part.name)} ${sanitizeVerilogName(part.name)}_inst (${conns});`)
  }
  lines.push('endmodule')
  return lines.join('\n')
}