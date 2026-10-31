/**
 * Validación básica de un módulo HDL (M9-05).
 */

import type { HdlModule } from './parser'
import { sanitizeVerilogName } from './verilog'

export interface HdlValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}

export function validateHdlModule(mod: HdlModule): HdlValidationResult {
  const errors: string[] = []
  if (!mod.name || sanitizeVerilogName(mod.name) !== mod.name) {
    // el nombre debe ser un identificador válido (sin espacios)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(mod.name)) errors.push('nombre de módulo inválido')
  }
  if (mod.inputs.length === 0) errors.push('sin entradas')
  if (mod.outputs.length === 0) errors.push('sin salidas')
  const names = new Set<string>()
  for (const p of mod.parts) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name)) errors.push(`parte inválida: ${p.name}`)
    for (const c of p.connections) {
      if (!c.name) errors.push('conexión sin nombre')
      if (!c.value) errors.push('conexión sin valor')
    }
    if (names.has(p.name)) errors.push(`parte repetida: ${p.name}`)
    names.add(p.name)
  }
  return { valid: errors.length === 0, errors }
}