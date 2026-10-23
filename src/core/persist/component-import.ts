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
import { inspectComponentDependencies } from './component-dependencies'
import { loadCircuitFromSerialized } from './json'

/** Resultado de una importación: el raíz nuevo y todos los circuitos añadidos. */
export interface ImportedComponent {
  readonly rootCircuitId: Id
  readonly circuitIds: readonly Id[]
}

export type ComponentImportErrorCode = 'missing-dependency' | 'circular-dependency'

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
  assertDependencies(document)

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

/**
 * Comprueba el árbol antes de crear nada.
 *
 * Faltar una dependencia deja una instancia rota; un lazo de subcircuitos no se puede
 * aplanar para simular. En ambos casos se avisa antes de tocar el proyecto, y el llamador
 * recibe un código estable para enseñar el mensaje que quiera.
 */
function assertDependencies(document: SerializedComponent): void {
  const report = inspectComponentDependencies(document)

  if (report.missing.length > 0) {
    const detail = report.missing
      .map((missing) => `${missing.circuitId} → ${missing.targetCircuitId}`)
      .join(', ')
    throw new ComponentImportError(
      'missing-dependency',
      `Faltan dependencias en el componente: ${detail}.`,
    )
  }

  if (report.cycles.length > 0) {
    const cycle = report.cycles[0]
    throw new ComponentImportError(
      'circular-dependency',
      `El componente tiene un lazo de subcircuitos: ${cycle?.circuitIds.join(' → ')}.`,
    )
  }
}
