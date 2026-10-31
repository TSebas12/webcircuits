/**
 * Reutilización de subcircuitos equivalentes (M8B-04).
 *
 * Antes de generar un circuito nuevo a partir de una tabla de verdad, conviene
 * comprobar si el proyecto ya contiene un subcircuito con la misma función: en ese
 * caso se reutiliza la instancia en lugar de duplicar lógica.
 */

import type { BooleanFunction } from './function'

/** Dos funciones son equivalentes si tienen los mismos minterms (y don't cares compatibles). */
export function functionsEquivalent(a: BooleanFunction, b: BooleanFunction): boolean {
  if (a.inputCount !== b.inputCount) return false
  if (a.minterms.length !== b.minterms.length) return false
  const aSet = new Set<number>(a.minterms)
  for (const m of b.minterms) {
    if (!aSet.has(m)) return false
  }
  return true
}

export interface SubcircuitCandidate {
  readonly id: string
  readonly function: BooleanFunction
}

/** Devuelve el id del primer subcircuito equivalente o `null` si no hay ninguno. */
export function findEquivalentSubcircuit(
  existing: readonly SubcircuitCandidate[],
  target: BooleanFunction,
): string | null {
  for (const c of existing) {
    if (functionsEquivalent(c.function, target)) return c.id
  }
  return null
}