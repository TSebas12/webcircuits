/**
 * El documento abierto: un circuito en memoria con nombre y estado de guardado.
 *
 * Es la unidad que el editor maneja: tiene un nombre (el que se enseña en la barra
 * y el que acabará siendo el nombre del fichero), un circuito (el `Diagram`) y la
 * marca de si hay cambios sin guardar. **No sabe nada de disco**: guardar y abrir
 * son tareas de M4; aquí solo se recuerda qué revisión se considera «guardada»
 * para poder decir si el documento está sucio.
 *
 * El sucio se calcula **por revisión**, no con un booleano suelto: el `Diagram`
 * ya lleva un contador que sube con cada cambio, así que comparar la revisión
 * actual con la que se guardó es exacto y no se puede desincronizar a mano.
 * Es lo que hace el original con `savedVersion` frente a `CircuitProject.Version`.
 *
 * De momento hay un solo circuito —la hoja principal—; cuando lleguen los
 * subcircuitos (M3) el «circuito actual» será uno de varios y este objeto
 * guardará cuál. Por eso el nombre del circuito activo se deja como dato aquí
 * y no se asume que siempre es el principal.
 */

import { Diagram, MAIN_CIRCUIT_ID } from './diagram'
import type { Id } from './types'

/** Nombre que se pone a un documento recién creado, sin nombre aún. */
export const UNTITLED_DOCUMENT_NAME = 'Sin título'

export class Document {
  private _name: string
  private _currentCircuitId: Id
  /** La revisión del diagrama que se considera «guardada». */
  private savedRevision: number

  constructor(name: string = UNTITLED_DOCUMENT_NAME, diagram: Diagram = new Diagram()) {
    this._name = name
    this._currentCircuitId = MAIN_CIRCUIT_ID
    this.savedRevision = diagram.revision
    this.diagram = diagram
  }

  /** El circuito que se está editando. */
  readonly diagram: Diagram

  /** El nombre del documento (el que se enseña y el que acabará siendo el fichero). */
  get name(): string {
    return this._name
  }

  /** El circuito que está abierto ahora mismo. */
  get currentCircuitId(): Id {
    return this._currentCircuitId
  }

  /** Hay cambios sin guardar desde la última vez que se marcó como guardado. */
  get dirty(): boolean {
    return this.diagram.revision !== this.savedRevision
  }

  /** La revisión actual del circuito. */
  get revision(): number {
    return this.diagram.revision
  }

  /** Cambia el nombre del documento. No toca el estado de guardado del circuito. */
  rename(name: string): void {
    this._name = name
  }

  /** Marca el circuito como guardado: a partir de aquí no está sucio. */
  markSaved(): void {
    this.savedRevision = this.diagram.revision
  }

  /** Abre otro circuito del mismo documento. De momento solo existe el principal. */
  openCircuit(circuitId: Id): void {
    this._currentCircuitId = circuitId
  }
}

/** Crea un documento vacío con el nombre indicado (o sin título). */
export function createDocument(name?: string): Document {
  return new Document(name)
}