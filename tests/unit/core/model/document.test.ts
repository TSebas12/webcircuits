/**
 * El documento abierto (`M2-28`).
 *
 * Lo que se comprueba aquí es que el estado del documento —nombre, circuito
 * actual, sucio— se comporta como un envoltorio coherente sobre el `Diagram`:
 *
 * - un documento recién creado **no está sucio** (su revisión guardada es la
 *   del diagrama vacío);
 * - cualquier cambio del circuito lo marca sucio;
 * - `markSaved()` lo limpia de nuevo;
 * - el nombre se puede cambiar sin tocar el estado de guardado del circuito;
 * - deshacer y rehacer mueven el sucio con la revisión, no con un booleano.
 */

import { describe, expect, it } from 'vitest'
import { Diagram } from '../../../../src/core/model/diagram'
import {
  Document,
  UNTITLED_DOCUMENT_NAME,
  createDocument,
} from '../../../../src/core/model/document'

describe('el documento abierto (M2-28)', () => {
  it('empieza sin título, con el circuito principal y sin cambios', () => {
    const document = new Document()

    expect(document.name).toBe(UNTITLED_DOCUMENT_NAME)
    expect(document.currentCircuitId).toBe('main')
    expect(document.dirty).toBe(false)
    expect(document.diagram.count).toBe(0)
  })

  it('createDocument crea un documento vacío con el nombre indicado', () => {
    const document = createDocument('mi circuito')

    expect(document.name).toBe('mi circuito')
    expect(document.dirty).toBe(false)
  })

  it('un cambio del circuito marca el documento como sucio', () => {
    const document = new Document()

    document.diagram.addGate('and', { x: 0, y: 0 }, 2)

    expect(document.dirty).toBe(true)
  })

  it('markSaved limpia el sucio', () => {
    const document = new Document()
    document.diagram.addGate('and', { x: 0, y: 0 }, 2)

    expect(document.dirty).toBe(true)

    document.markSaved()

    expect(document.dirty).toBe(false)
  })

  it('si se vuelve a modificar tras guardar, vuelve a estar sucio', () => {
    const document = new Document()
    document.diagram.addGate('and', { x: 0, y: 0 }, 2)
    document.markSaved()

    document.diagram.addButton({ x: 5, y: 0 }, { isToggle: true })

    expect(document.dirty).toBe(true)
  })

  it('renombrar no cambia el estado de guardado del circuito', () => {
    const document = new Document()
    document.diagram.addGate('and', { x: 0, y: 0 }, 2)
    const dirtyBefore = document.dirty

    document.rename('otro nombre')

    expect(document.name).toBe('otro nombre')
    expect(document.dirty).toBe(dirtyBefore)
  })

  it('deshacer y rehacer mueven el sucio con la revisión (el original cuenta transacciones)', () => {
    const document = new Document()
    document.diagram.addGate('and', { x: 0, y: 0 }, 2)
    document.markSaved()

    // deshacer es una transacción nueva: la revisión cambia y el documento queda sucio,
    // aunque el contenido haya vuelto al estado guardado (es lo que hace el original).
    expect(document.diagram.undo()).toBe(true)
    expect(document.dirty).toBe(true)

    // rehacer, igual: otra transacción, sigue sucio hasta que se guarde.
    expect(document.diagram.redo()).toBe(true)
    expect(document.dirty).toBe(true)

    document.markSaved()
    expect(document.dirty).toBe(false)
  })

  it('se puede envolver un diagrama ya existente', () => {
    const diagram = new Diagram()
    diagram.addGate('and', { x: 0, y: 0 }, 2)

    const document = new Document('con cambios', diagram)

    // el diagrama ya estaba modificado, pero al crear el documento se considera guardado
    expect(document.dirty).toBe(false)
    expect(document.diagram).toBe(diagram)

    // si se modifica más, pasa a sucio
    diagram.addWire({ x: 0, y: 0 }, { x: 5, y: 0 })
    expect(document.dirty).toBe(true)

    // y markSaved vuelve a limpiar
    document.markSaved()
    expect(document.dirty).toBe(false)
    expect(document.revision).toBe(diagram.revision)
  })

  it('openCircuit cambia el circuito activo', () => {
    const document = new Document()

    document.openCircuit('otro-circuito')

    expect(document.currentCircuitId).toBe('otro-circuito')
  })
})
