/**
 * Validación de dependencias de un componente (M4C-05).
 *
 * El formato `.wccomp` empaqueta las dependencias, así que no hay que resolverlas contra
 * una biblioteca externa: o viajan dentro del fichero o el componente está roto. Aquí se
 * detectan los dos casos que rompen el árbol:
 *
 * - Una instancia apunta a un circuito que no está en `circuits`.
 * - Los subcircuitos forman un lazo (A usa B y B usa A, o A se usa a sí mismo). Un lazo no
 *   se puede aplanar para simular y, además, haría que la exportación no terminara nunca.
 *
 * La función es pura y no modifica el documento: la usan el importador y el exportador antes
 * de tocar el proyecto.
 */

import type { SerializedComponent } from './component-format'

export interface MissingComponentDependency {
  readonly circuitId: string
  readonly targetCircuitId: string
}

/** El ciclo incluye el primer circuito otra vez al final para leerlo como un camino. */
export interface ComponentDependencyCycle {
  readonly circuitIds: readonly string[]
}

export interface ComponentDependencyReport {
  readonly missing: readonly MissingComponentDependency[]
  readonly cycles: readonly ComponentDependencyCycle[]
  readonly ok: boolean
}

/** Inspecciona las referencias entre circuitos sin lanzar errores. */
export function inspectComponentDependencies(
  component: SerializedComponent,
): ComponentDependencyReport {
  const byId = new Map(component.circuits.map((circuit) => [circuit.id, circuit]))
  const adjacency = new Map<string, string[]>()
  const missing: MissingComponentDependency[] = []

  for (const circuit of component.circuits) {
    const targets: string[] = []
    for (const element of circuit.elements) {
      if (element.kind !== 'circuit') {
        continue
      }
      const target = element.targetCircuitId
      if (typeof target !== 'string' || !byId.has(target)) {
        missing.push({
          circuitId: circuit.id,
          targetCircuitId: typeof target === 'string' ? target : String(target),
        })
        continue
      }
      targets.push(target)
    }
    adjacency.set(circuit.id, targets)
  }

  const cycles = findCycles(
    component.circuits.map((circuit) => circuit.id),
    adjacency,
  )
  return {
    missing,
    cycles,
    ok: missing.length === 0 && cycles.length === 0,
  }
}

function findCycles(
  ids: readonly string[],
  adjacency: ReadonlyMap<string, readonly string[]>,
): readonly ComponentDependencyCycle[] {
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []
  const cycles: ComponentDependencyCycle[] = []
  const seen = new Set<string>()

  const visit = (id: string): void => {
    const current = state.get(id)
    if (current === 'done') {
      return
    }
    if (current === 'visiting') {
      const start = stack.indexOf(id)
      if (start >= 0) {
        const circuitIds = [...stack.slice(start), id]
        const key = cycleKey(circuitIds)
        if (!seen.has(key)) {
          seen.add(key)
          cycles.push({ circuitIds })
        }
      }
      return
    }

    state.set(id, 'visiting')
    stack.push(id)
    for (const target of adjacency.get(id) ?? []) {
      visit(target)
    }
    stack.pop()
    state.set(id, 'done')
  }

  for (const id of ids) {
    visit(id)
  }
  return cycles
}

/** Normaliza un ciclo para que A→B→A y B→A→B cuenten como el mismo. */
function cycleKey(cycle: readonly string[]): string {
  const nodes = cycle.slice(0, -1)
  if (nodes.length === 0) {
    return ''
  }
  let smallest = 0
  for (let index = 1; index < nodes.length; index += 1) {
    if ((nodes[index] as string) < (nodes[smallest] as string)) {
      smallest = index
    }
  }
  return [...nodes.slice(smallest), ...nodes.slice(0, smallest)].join('>')
}
