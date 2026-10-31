/**
 * Verificación automática de una síntesis (M8B-06).
 *
 * Evalúa el netlist generado para todas las combinaciones de entrada y lo compara
 * con la función pedida. Así se garantiza que nunca se genera un circuito
 * incorrecto en silencio.
 */

import type { BooleanFunction } from './function'
import type { Netlist } from './netlist'

export interface VerificationResult {
  readonly equivalent: boolean
  /** Índices de fila en los que la salida del netlist difiere de la pedida. */
  readonly mismatches: readonly number[]
}

export function verifyNetlist(fn: BooleanFunction, netlist: Netlist): VerificationResult {
  const total = 1 << fn.inputCount
  const mismatchSet = new Set<number>()

  for (let row = 0; row < total; row += 1) {
    const values = new Map<string, number>()
    // entradas
    for (let i = 0; i < fn.inputCount; i += 1) {
      const bit = (row >>> (fn.inputCount - 1 - i)) & 1
      values.set(`in${i}`, bit)
    }
    // evaluar en orden topológico (el netlist ya está ordenado por construcción)
    for (const node of netlist.nodes) {
      if (node.kind === 'input') continue
      if (node.kind === 'const') {
        values.set(node.id, node.value ?? 0)
        continue
      }
      const inputs = node.inputs.map((id) => values.get(id) ?? 0)
      let out = 0
      switch (node.kind) {
        case 'not':
          out = (inputs[0] ?? 0) === 0 ? 1 : 0
          break
        case 'and':
          out = inputs.every((v) => v === 1) ? 1 : 0
          break
        case 'or':
          out = inputs.some((v) => v === 1) ? 1 : 0
          break
      }
      values.set(node.id, out)
    }
    const got = values.get(netlist.outputNodeId) ?? 0
    const expected = fn.minterms.includes(row) ? 1 : 0
    if (got !== expected) mismatchSet.add(row)
  }

  const mismatches = [...mismatchSet].sort((a, b) => a - b)
  return { equivalent: mismatches.length === 0, mismatches }
}