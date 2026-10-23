/**
 * Exportar un subcircuito como componente (M4C-02).
 *
 * Un componente no puede exportarse solo: si el subcircuito usa otros subcircuitos, esos
 * también tienen que viajar o el fichero llegará roto a otro proyecto. Aquí se recorre la
 * jerarquía desde el raíz y se empaqueta **solo** ese árbol, no el proyecto entero.
 *
 * La salida pasa por `component-format.ts`, así que el fichero que se escribe es el mismo
 * que valida el importador. Las dependencias se recorren con una pila y un conjunto de
 * visitados: un lazo accidental no cuelga y un circuito repetido no se duplica.
 */

import type { CircuitProject } from '../model/circuit'
import type { Id } from '../model/types'
import {
  createComponentDocument,
  serializeComponent,
  type ComponentMetadata,
  type SerializedComponent,
} from './component-format'
import { serializeCircuit, type SerializedCircuit } from './json'

/** Lo que hay que indicar para exportar. El nombre sale del circuito si no se da otro. */
export interface ExportComponentOptions {
  readonly rootCircuitId: Id
  readonly metadata?: Partial<ComponentMetadata>
}

export type ComponentExportErrorCode = 'missing-root' | 'missing-dependency'

/** Error de exportación, separado de los errores de formato. */
export class ComponentExportError extends Error {
  constructor(
    readonly code: ComponentExportErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ComponentExportError'
  }
}

/**
 * Recorre el raíz y sus dependencias, en profundidad y sin repetir circuitos.
 *
 * El raíz va primero porque es el que la biblioteca usará como nombre e interfaz. El orden
 * de las dependencias es el de la primera visita, que a su vez sigue el orden de los
 * elementos del circuito: así el fichero es estable entre exportaciones.
 */
export function collectComponentCircuits(
  project: CircuitProject,
  rootCircuitId: Id,
): readonly SerializedCircuit[] {
  const visited = new Set<Id>()
  const ordered: SerializedCircuit[] = []

  const visit = (id: Id): void => {
    if (visited.has(id)) {
      return
    }
    const circuit = project.circuit(id)
    if (circuit === undefined) {
      throw new ComponentExportError(
        id === rootCircuitId ? 'missing-root' : 'missing-dependency',
        id === rootCircuitId
          ? `El circuito raíz ${id} no existe en el proyecto.`
          : `Falta el subcircuito ${id}, que usa el componente.`,
      )
    }
    visited.add(id)
    ordered.push(serializeCircuit(circuit))
    for (const element of circuit.elements) {
      if (element.kind === 'circuit') {
        visit(element.targetCircuitId)
      }
    }
  }

  visit(rootCircuitId)
  return ordered
}

/** Crea el documento validado, listo para serializar. */
export function createComponentFromProject(
  project: CircuitProject,
  options: ExportComponentOptions,
): SerializedComponent {
  const circuit = project.circuit(options.rootCircuitId)
  if (circuit === undefined) {
    throw new ComponentExportError(
      'missing-root',
      `El circuito raíz ${options.rootCircuitId} no existe en el proyecto.`,
    )
  }

  const metadata: ComponentMetadata = {
    name: options.metadata?.name ?? circuit.name,
    description: options.metadata?.description ?? '',
    author: options.metadata?.author ?? '',
    createdAt: options.metadata?.createdAt ?? new Date().toISOString(),
    tags: options.metadata?.tags ?? [],
  }

  return createComponentDocument({
    metadata,
    rootCircuitId: options.rootCircuitId,
    circuits: collectComponentCircuits(project, options.rootCircuitId),
  })
}

/** Empaqueta un subcircuito y devuelve el texto que se guarda como `.wccomp`. */
export function exportComponent(
  project: CircuitProject,
  options: ExportComponentOptions,
): string {
  return serializeComponent(createComponentFromProject(project, options))
}
