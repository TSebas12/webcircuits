/**
 * Importar un componente `.wccomp` a un proyecto (M4C-03).
 *
 * Un componente no es una pieza suelta: es un árbol de circuitos. Al importarlo hay que
 * crear **todos** los circuitos con ids nuevos y reescribir las referencias entre ellos,
 * igual que hace la carga de un proyecto. Si se copiaran los ids tal cual, dos componentes
 * del mismo tipo chocarían y una instancia acabaría apuntando al circuito de otro.
 *
 * La operación es todo o nada: primero se valida el árbol completo y después se crean y
 * rellenan los circuitos. Si algo falla al rellenar, se borran los circuitos recién creados
 * para no dejar basura a medio importar.
 */

import type { CircuitProject } from '../model/circuit'
import type { Id } from '../model/types'
import { validateComponent, type SerializedComponent } from './component-format'
import { loadCircuitFromSerialized, type SerializedCircuit } from './json'

/** Resultado de una importación: el raíz nuevo y todos los circuitos añadidos. */
export interface ImportedComponent {
  readonly rootCircuitId: Id
  readonly circuitIds: readonly Id[]
}

export type ComponentImportErrorCode = 'missing-dependency' | 'duplicate-circuit'

/** Error de importación distinto de un formato inválido. */
export class ComponentImportError extends Error {
  constructor(
    readonly code: ComponentImportErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ComponentImportError'
  }
}

/**
 * Añade el componente al proyecto y devuelve el id del raíz importado.
 *
 * No navega ni coloca nada: deja los circuitos disponibles para que la paleta los ofrezca
 * como cualquier subcircuito. El llamador decide si quiere entrar a editarlos o colocarlos.
 */
export function importComponent(
  project: CircuitProject,
  component: SerializedComponent,
): ImportedComponent {
  const document = validateComponent(component)
  const byOldId = indexCircuits(document.circuits)
  assertDependencies(document.circuits, byOldId)

  const idMap = new Map<string, string>()
  const created: Id[] = []

  try {
    // 1) Crear todos los circuitos antes de rellenarlos: una referencia puede apuntar a uno
    //    que todavía no se ha cargado.
    for (const source of document.circuits) {
      const circuit = project.createCircuit({ name: source.name })
      idMap.set(source.id, circuit.id)
      created.push(circuit.id)
    }

    // 2) Rellenar con el mapa completo, para que las instancias de subcircuito apunten a los
    //    ids nuevos y no a los del proyecto de origen.
    for (const source of document.circuits) {
      const circuit = project.circuit(idMap.get(source.id) as Id)
      if (circuit === undefined) {
        throw new Error(`No se pudo crear el circuito ${source.id}.`)
      }
      loadCircuitFromSerialized(circuit, source, idMap)
    }
  } catch (error) {
    for (const id of created.reverse()) {
      project.deleteCircuit(id)
    }
    throw error
  }

  return {
    rootCircuitId: idMap.get(document.rootCircuitId) as Id,
    circuitIds: created,
  }
}

function indexCircuits(
  circuits: readonly SerializedCircuit[],
): ReadonlyMap<string, SerializedCircuit> {
  const byId = new Map<string, SerializedCircuit>()
  for (const circuit of circuits) {
    if (byId.has(circuit.id)) {
      // `validateComponent` ya lo rechaza, pero esta función también puede usarse con
      // documentos construidos a mano en tests o por un importador futuro.
      throw new ComponentImportError(
        'duplicate-circuit',
        `El circuito ${circuit.id} aparece más de una vez.`,
      )
    }
    byId.set(circuit.id, circuit)
  }
  return byId
}

/**
 * Comprueba que cada instancia de subcircuito apunta a un circuito incluido en el paquete.
 *
 * Se hace antes de crear nada: si faltara una dependencia, importar dejaría una instancia
 * rota o un proyecto a medias. M4C-05 ampliará esta validación a otros cruces, pero este es
 * el que no puede esperar: sin él, el componente no se puede usar.
 */
function assertDependencies(
  circuits: readonly SerializedCircuit[],
  byId: ReadonlyMap<string, SerializedCircuit>,
): void {
  for (const circuit of circuits) {
    for (const element of circuit.elements) {
      if (element.kind !== 'circuit') {
        continue
      }
      const target = element.targetCircuitId
      if (typeof target !== 'string' || !byId.has(target)) {
        throw new ComponentImportError(
          'missing-dependency',
          `El circuito ${circuit.id} usa el subcircuito ${String(target)}, que no está en el componente.`,
        )
      }
    }
  }
}
