/**
 * El circuito que se está editando.
 *
 * Guarda los elementos y avisa cuando cambian. Hacia fuera es de solo lectura: quien lo
 * usa pide cambios y lee `elements`, nunca toca el mapa de dentro. Eso es lo que permite
 * que el lienzo, la simulación y el futuro deshacer (M2) se apoyen en el mismo sitio.
 *
 * De momento hay un solo circuito —la hoja principal—; los subcircuitos llegan en M2, y
 * por eso cada elemento ya lleva su `circuitId`.
 *
 * ⚠️ Aquí no hay nada de dibujado ni de simulación: esto es el **documento**. Qué vale un
 * cable lo dice el motor (`core/simulate/`), y cómo se pinta, el renderizador.
 */

import { deviceBounds, deviceLayout, pinPosition } from './layout'
import type { Button, Element, Gate, GateType, GridPoint, GridRect, Id, Wire } from './types'

/** El circuito de la hoja principal. El original lo llama `LogicalCircuit`. */
export const MAIN_CIRCUIT_ID = 'main'

/** El documento: los elementos colocados y nada más. */
export class Diagram {
  private readonly items = new Map<Id, Element>()
  private readonly listeners = new Set<() => void>()
  private counter = 0
  private revisionCount = 0

  /**
   * Sube cada vez que algo cambia. Sirve para no recalcular de más: si el número no ha
   * cambiado, ni la escena ni la simulación pueden haber cambiado.
   */
  get revision(): number {
    return this.revisionCount
  }

  /** Todos los elementos, en orden de creación. */
  get elements(): Element[] {
    return [...this.items.values()]
  }

  get count(): number {
    return this.items.size
  }

  /** Avisa de cada cambio. Devuelve la función para dejar de escuchar. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  get(id: Id): Element | undefined {
    return this.items.get(id)
  }

  /** Un identificador nuevo. Lleva prefijo para que se lea en los registros al depurar. */
  private nextId(prefix: string): Id {
    this.counter += 1
    return `${prefix}-${this.counter}`
  }

  private changed(): void {
    this.revisionCount += 1
    for (const listener of this.listeners) {
      listener()
    }
  }

  addGate(gateType: GateType, position: GridPoint, inputCount = 2, invertedOutput = false): Gate {
    const gate: Gate = {
      kind: 'gate',
      id: this.nextId('gate'),
      circuitId: MAIN_CIRCUIT_ID,
      position,
      rotation: 'up',
      gateType,
      inputCount,
      invertedOutput,
    }
    this.items.set(gate.id, gate)
    this.changed()
    return gate
  }

  /**
   * Coloca un interruptor de entrada.
   *
   * Los valores por defecto son **los del original** (`Schema/CircuitProject.xml`):
   * momentáneo y sin invertir. Quien quiera un interruptor que se quede —lo normal al
   * colocarlo a mano, porque con el ratón no se pueden pulsar dos a la vez— lo pide.
   */
  addButton(
    position: GridPoint,
    options: { readonly isToggle?: boolean; readonly inverted?: boolean } = {},
  ): Button {
    const button: Button = {
      kind: 'button',
      id: this.nextId('button'),
      circuitId: MAIN_CIRCUIT_ID,
      position,
      rotation: 'up',
      isToggle: options.isToggle ?? false,
      inverted: options.inverted ?? false,
    }
    this.items.set(button.id, button)
    this.changed()
    return button
  }

  addWire(p1: GridPoint, p2: GridPoint, bitWidth = 1): Wire {
    const wire: Wire = {
      kind: 'wire',
      id: this.nextId('wire'),
      circuitId: MAIN_CIRCUIT_ID,
      p1,
      p2,
      bitWidth,
    }
    this.items.set(wire.id, wire)
    this.changed()
    return wire
  }

  /** Mueve un elemento de la rejilla. Los cables se mueven moviendo sus dos puntas. */
  move(id: Id, position: GridPoint): void {
    const element = this.items.get(id)
    if (element === undefined || element.kind === 'wire') {
      return
    }
    if (element.position.x === position.x && element.position.y === position.y) {
      return
    }
    this.items.set(id, { ...element, position })
    this.changed()
  }

  /**
   * Mueve **una punta** de un cable.
   *
   * Se separa de `move` porque un cable no tiene posición: tiene dos puntos, y arrastrar
   * uno solo de ellos es justo lo que hace falta al recolocar una conexión.
   */
  moveWireEnd(id: Id, end: 1 | 2, point: GridPoint): void {
    const element = this.items.get(id)
    if (element === undefined || element.kind !== 'wire') {
      return
    }
    const next: Wire = end === 1 ? { ...element, p1: point } : { ...element, p2: point }
    this.items.set(id, next)
    this.changed()
  }

  remove(id: Id): void {
    if (this.items.delete(id)) {
      this.changed()
    }
  }

  clear(): void {
    if (this.items.size === 0) {
      return
    }
    this.items.clear()
    this.changed()
  }

  /** Los dispositivos (todo lo que no es un cable). */
  get devices(): (Gate | Button)[] {
    const result: (Gate | Button)[] = []
    for (const item of this.items.values()) {
      if (item.kind !== 'wire') {
        result.push(item)
      }
    }
    return result
  }

  /**
   * Qué dispositivo hay en un punto de la rejilla, si hay alguno.
   *
   * Se usa para no dejar que dos símbolos se solapen: en el original tampoco se puede.
   */
  deviceAt(point: GridPoint, ignoreId?: Id): Gate | Button | undefined {
    for (const device of this.devices) {
      if (device.id === ignoreId) {
        continue
      }
      const box = deviceBounds(device)
      if (point.x >= box.x0 && point.x < box.x1 && point.y >= box.y0 && point.y < box.y1) {
        return device
      }
    }
    return undefined
  }
}

/**
 * Los nodos de un cable, con la caja que ocupan.
 * Se usa para saber qué cables hay que mirar al mover un dispositivo.
 */
export function wireBounds(wire: Wire): GridRect {
  return {
    x0: Math.min(wire.p1.x, wire.p2.x),
    y0: Math.min(wire.p1.y, wire.p2.y),
    x1: Math.max(wire.p1.x, wire.p2.x),
    y1: Math.max(wire.p1.y, wire.p2.y),
  }
}

/** ¿Qué pines de este dispositivo caen sobre el punto indicado? */
export function pinsAt(device: Gate | Button, point: GridPoint): number[] {
  const layout = deviceLayout(device)
  const found: number[] = []
  for (let index = 0; index < layout.pins.length; index += 1) {
    const pin = layout.pins[index]
    if (pin === undefined) {
      continue
    }
    const absolute = pinPosition(device.position, device.rotation, layout, pin)
    if (absolute.x === point.x && absolute.y === point.y) {
      found.push(index)
    }
  }
  return found
}
