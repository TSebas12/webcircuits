/**
 * El documento y su historial (`M2-23`).
 *
 * Lo que se comprueba aquí no es «que deshacer funcione» —eso se ve a ojo— sino las tres cosas
 * que se rompen sin que nadie se entere:
 *
 * - que una acción se apile **una sola vez** aunque toque el modelo muchas veces (un arrastre
 *   son decenas de `move`);
 * - que deshacer devuelva el circuito **exactamente** como estaba, sin dejar rastro;
 * - que el contador de identificadores no rebobine, que es la trampa clásica del deshacer por
 *   fotos.
 */

import { describe, expect, it } from 'vitest'
import { Diagram } from '../../../../src/core/model/diagram'
import type { Button, Gate } from '../../../../src/core/model/types'

/** El circuito entero, en texto, para comparar estados «exactos» sin escribir un `toEqual`. */
function snapshotOf(diagram: Diagram): string {
  return JSON.stringify(diagram.elements)
}

/** La posición de un elemento que no sea un cable (los cables no tienen). */
function positionOf(diagram: Diagram, id: string): unknown {
  const element = diagram.get(id)
  return element === undefined || element.kind === 'wire' ? null : element.position
}

describe('el historial del documento', () => {
  it('empieza sin nada que deshacer ni rehacer', () => {
    const diagram = new Diagram()

    expect(diagram.canUndo).toBe(false)
    expect(diagram.canRedo).toBe(false)
    expect(diagram.undo()).toBe(false)
    expect(diagram.redo()).toBe(false)
  })

  it('cada colocación es una acción, y se deshace sola', () => {
    const diagram = new Diagram()
    diagram.addGate('and', { x: 0, y: 0 }, 2)

    expect(diagram.canUndo).toBe(true)
    expect(diagram.undo()).toBe(true)
    expect(diagram.count).toBe(0)
    expect(diagram.canUndo).toBe(false)
    expect(diagram.canRedo).toBe(true)

    expect(diagram.redo()).toBe(true)
    expect(diagram.count).toBe(1)
  })

  it('20 acciones y 20 deshaceres devuelven al circuito exacto, y 20 rehaceres lo reponen (M2-23)', () => {
    const diagram = new Diagram()
    const empty = snapshotOf(diagram)

    for (let index = 0; index < 10; index += 1) {
      diagram.addGate('and', { x: index * 5, y: 0 }, 2)
      diagram.addButton({ x: index * 5, y: 6 }, { isToggle: true })
    }

    const full = snapshotOf(diagram)
    expect(diagram.count).toBe(20)

    for (let index = 0; index < 20; index += 1) {
      expect(diagram.undo()).toBe(true)
    }
    expect(diagram.canUndo).toBe(false)
    expect(snapshotOf(diagram)).toBe(empty)

    for (let index = 0; index < 20; index += 1) {
      expect(diagram.redo()).toBe(true)
    }
    expect(diagram.canRedo).toBe(false)
    // «Exacto» incluye el orden, que es la profundidad: lo último colocado se dibuja encima.
    expect(snapshotOf(diagram)).toBe(full)
  })

  it('una acción abierta agrupa muchos cambios en un solo deshacer', () => {
    const diagram = new Diagram()
    const gate = diagram.addGate('and', { x: 0, y: 0 }, 2)
    const origin = { ...gate.position }

    diagram.beginChange()
    for (let x = 1; x <= 10; x += 1) {
      diagram.move(gate.id, { x, y: 0 })
    }
    diagram.endChange()

    expect(positionOf(diagram, gate.id)).toEqual({ x: 10, y: 0 })

    // Deshacer no retrocede un paso del arrastre: devuelve la pieza a donde estaba **antes** de
    // empezarlo, que es lo que un `Ctrl+Z` tiene que hacer.
    expect(diagram.undo()).toBe(true)
    expect(positionOf(diagram, gate.id)).toEqual(origin)
    // y queda por deshacer la colocación, que fue otra acción.
    expect(diagram.canUndo).toBe(true)
  })

  it('las acciones se pueden anidar: la de dentro se funde con la de fuera', () => {
    const diagram = new Diagram()

    // Esto es lo que hace el editor al cargar el ejemplo: abre una acción y coloca siete cosas,
    // cada una de las cuales abre y cierra la suya.
    diagram.beginChange()
    diagram.addGate('and', { x: 0, y: 0 }, 2)
    diagram.addGate('led', { x: 5, y: 0 }, 1)
    diagram.endChange()

    expect(diagram.count).toBe(2)

    expect(diagram.undo()).toBe(true)
    expect(diagram.count).toBe(0)
    expect(diagram.canUndo).toBe(false)
  })

  it('una acción que no cambia nada no deja rastro, y no invalida lo deshecho', () => {
    const diagram = new Diagram()
    const gate = diagram.addGate('and', { x: 4, y: 4 }, 2)
    diagram.undo()
    expect(diagram.canRedo).toBe(true)

    diagram.beginChange()
    diagram.move(gate.id, { x: 4, y: 4 }) // la misma casilla: `move` no hace nada
    diagram.endChange()

    // Ni se apila…
    expect(diagram.canUndo).toBe(false)
    // …ni se lleva por delante el rehacer, que es lo que pasaría si cualquier acción nueva
    // limpiara la pila aunque no hubiera cambiado nada.
    expect(diagram.canRedo).toBe(true)
  })

  it('una acción nueva invalida lo deshecho', () => {
    const diagram = new Diagram()
    diagram.addGate('and', { x: 0, y: 0 }, 2)
    diagram.undo()
    expect(diagram.canRedo).toBe(true)

    diagram.addButton({ x: 10, y: 0 }, { isToggle: true })

    expect(diagram.canRedo).toBe(false)
  })

  it('el contador de identificadores no rebobina: una pieza nueva nunca reutiliza el nombre de una deshecha', () => {
    const diagram = new Diagram()
    diagram.addGate('and', { x: 0, y: 0 }, 2)
    const second = diagram.addGate('and', { x: 10, y: 0 }, 2)

    diagram.undo()
    expect(diagram.get(second.id)).toBeUndefined()

    const third = diagram.addGate('and', { x: 10, y: 0 }, 2)

    // Si el contador hubiera vuelto atrás, `third` se llamaría como `second`, y el historial
    // podría llegar a reponer dos piezas con el mismo nombre a la vez.
    expect(third.id).not.toBe(second.id)
  })

  it('borrar y vaciar también son acciones', () => {
    const diagram = new Diagram()
    const gate = diagram.addGate('and', { x: 0, y: 0 }, 2)
    diagram.addWire({ x: 0, y: 0 }, { x: 4, y: 0 })

    diagram.remove(gate.id)
    expect(diagram.get(gate.id)).toBeUndefined()
    expect(diagram.count).toBe(1) // el cable sigue: `remove` no se lleva nada por delante

    diagram.undo()
    expect(diagram.get(gate.id)).toBeDefined()

    diagram.clear()
    expect(diagram.count).toBe(0)

    diagram.undo()
    expect(diagram.count).toBe(2)
  })

  it('el historial tiene tope: más allá de cien acciones, la más vieja se olvida', () => {
    const diagram = new Diagram()
    for (let index = 0; index < 101; index += 1) {
      diagram.addGate('and', { x: index * 5, y: 0 }, 2)
    }

    for (let index = 0; index < 100; index += 1) {
      expect(diagram.undo()).toBe(true)
    }

    // Se puede volver cien pasos atrás, ni uno más: queda el estado de después de la primera
    // colocación, porque su foto ya se tiró.
    expect(diagram.canUndo).toBe(false)
    expect(diagram.count).toBe(1)
  })

  it('deshacer avisa a quien escucha, que es como la barra sabe si encender sus botones', () => {
    const diagram = new Diagram()
    let avisos = 0
    const unsubscribe = diagram.subscribe(() => {
      avisos += 1
    })

    diagram.addGate('and', { x: 0, y: 0 }, 2)
    const trasColocar = avisos
    expect(trasColocar).toBeGreaterThan(0)

    diagram.undo()
    expect(avisos).toBeGreaterThan(trasColocar)

    unsubscribe()
    const antes = avisos
    diagram.redo()
    expect(avisos).toBe(antes)
  })
})

describe('lo que el documento no hace por su cuenta', () => {
  it('colocar un dispositivo no toca los cables: eso es política del editor', () => {
    const diagram = new Diagram()
    const button: Button = diagram.addButton({ x: 2, y: 2 }, { isToggle: true })
    const gate: Gate = diagram.addGate('and', { x: 8, y: 2 }, 2)
    diagram.addWire({ x: 4, y: 3 }, { x: 8, y: 3 })

    // Borrar la pieza deja el cable donde estaba: un cable con un extremo suelto es legal en el
    // modelo —el editor los crea a cada rato al tender un cable al vacío—, y el que se lleva los
    // cables por delante es el editor (`removeElement`), no el documento.
    diagram.remove(gate.id)
    expect(diagram.count).toBe(2)

    expect(button.id).not.toBe(gate.id)
  })
})

describe('la vista del editor y los datos guardados', () => {
  it('los pines y subcircuitos viajan en `storedElements` aunque el lienzo no los dibuje', () => {
    const diagram = new Diagram()
    diagram.addGate('and', { x: 0, y: 0 }, 2)
    diagram.addPin({ x: 0, y: 4 })

    expect(diagram.storedElements).toHaveLength(2)
    // `elements` es la vista dibujable: solo compuertas, interruptores y cables.
    expect(diagram.elements).toHaveLength(1)
    expect(diagram.elements[0]!.kind).toBe('gate')
  })

  it('los elementos creados llevan el `circuitId` del diagrama, no siempre el principal', () => {
    const diagram = new Diagram('sub-1')
    const gate = diagram.addGate('and', { x: 0, y: 0 }, 2)
    expect(gate.circuitId).toBe('sub-1')
  })

  it('un pin nuevo sale con el lado y el tipo en minúscula (no «Input»/«Left»)', () => {
    const diagram = new Diagram()
    const pin = diagram.addPin({ x: 0, y: 0 })
    expect(pin.pinType).toBe('input')
    expect(pin.side).toBe('left')
  })

  it('importar un elemento reserva su número para que una pieza nueva no lo reutilice', () => {
    const diagram = new Diagram()
    diagram.importElement({
      kind: 'gate',
      id: 'gate-7',
      circuitId: 'main',
      layerId: 'principal',
      position: { x: 0, y: 0 },
      rotation: 'up',
      gateType: 'and',
      inputCount: 2,
      bitWidth: 1,
      invertedOutput: false,
    })

    const created = diagram.addGate('and', { x: 4, y: 0 })
    expect(created.id).not.toBe('gate-7')
    expect(diagram.count).toBe(2)
  })
})
