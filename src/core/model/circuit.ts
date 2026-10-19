/**
 * Jerarquía de circuitos (M3-01).
 *
 * Un **proyecto** contiene N circuitos lógicos; cada uno es a la vez un circuito que se
 * puede editar (su lista de elementos) y un componente que se puede colocar en otro
 * circuito (su símbolo de hoja). El circuito principal (`MAIN_CIRCUIT_ID`) es uno más de
 * ellos; no hay nada especial en él salvo que es el que se abre al crear el proyecto.
 *
 * Aquí solo está el **modelo**; la navegación entre niveles (M3-02) y la edición de un
 * subcircuito (M3-03) viven en el editor. El formato de persistencia (M4) serializará
 * esto tal cual.
 *
 * ⚠️ Los pines de la hoja no se guardan: se deducen de los elementos del circuito, igual
 * que en M1/M2. Si en M4 el fichero exige guardarlos, se generan al exportar.
 */

import type { Id, StoredElement } from './types'
import { Diagram, MAIN_CIRCUIT_ID } from './diagram'

/** Nombre por defecto del circuito principal, como en el original. */
export const MAIN_CIRCUIT_NAME = 'Main'

export class Circuit {
  readonly id: Id
  name: string
  /** El documento editable de este nivel: lleva el historial de deshacer de este circuito. */
  readonly diagram: Diagram

  constructor(id: Id, name: string, diagram: Diagram = new Diagram(id)) {
    this.id = id
    this.name = name
    this.diagram = diagram
  }

  /**
   * Los elementos del circuito en el **orden del fichero** (creación), no en el de dibujo.
   *
   * Es lo que guardan y cargan los ficheros, y el orden importa: numera los pines de un
   * repartidor y casa las puntas de un subcircuito con las de la hoja que representa. Para
   * dibujar está `diagram.elements`, que sí va ordenado por capa.
   */
  get elements(): readonly StoredElement[] {
    return this.diagram.storedElements
  }
}

export interface CreateCircuitOptions {
  readonly name?: string
}

export class CircuitProject {
  private readonly circuits = new Map<Id, Circuit>()
  private counter = 0
  private _currentCircuitId: Id
  private versionCount = 0

  constructor(name = 'Sin título') {
    this.name = name
    const mainDiagram = new Diagram(MAIN_CIRCUIT_ID)
    const main = new Circuit(MAIN_CIRCUIT_ID, MAIN_CIRCUIT_NAME, mainDiagram)
    this.circuits.set(main.id, main)
    this._currentCircuitId = main.id
  }

  name: string

  get currentCircuitId(): Id {
    return this._currentCircuitId
  }

  get version(): number {
    return this.versionCount
  }

  /** Todos los circuitos, en orden de creación. */
  get circuitsList(): Circuit[] {
    return [...this.circuits.values()]
  }

  get count(): number {
    return this.circuits.size
  }

  circuit(id: Id): Circuit | undefined {
    return this.circuits.get(id)
  }

  get current(): Circuit {
    const found = this.circuits.get(this._currentCircuitId)
    if (found === undefined) {
      throw new Error(`circuito actual inexistente: ${this._currentCircuitId}`)
    }
    return found
  }

  /** Crea un circuito lógico nuevo y lo devuelve. */
  createCircuit(options: CreateCircuitOptions = {}): Circuit {
    this.counter += 1
    const id: Id = `circuit-${this.counter}`
    const diagram = new Diagram(id)
    const circuit = new Circuit(id, options.name ?? `Circuit ${this.counter}`, diagram)
    this.circuits.set(id, circuit)
    this.versionCount += 1
    return circuit
  }

  renameCircuit(id: Id, name: string): void {
    const circuit = this.circuits.get(id)
    if (circuit === undefined) return
    circuit.name = name
    this.versionCount += 1
  }

  deleteCircuit(id: Id): boolean {
    if (id === MAIN_CIRCUIT_ID) return false
    if (!this.circuits.has(id)) return false
    this.circuits.delete(id)
    if (this._currentCircuitId === id) {
      this._currentCircuitId = MAIN_CIRCUIT_ID
    }
    this.versionCount += 1
    return true
  }

  openCircuit(id: Id): boolean {
    if (!this.circuits.has(id)) return false
    this._currentCircuitId = id
    return true
  }

  /** ¿Se puede borrar este circuito? El principal nunca. */
  canDelete(id: Id): boolean {
    return id !== MAIN_CIRCUIT_ID && this.circuits.has(id)
  }
}