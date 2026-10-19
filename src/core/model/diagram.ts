/**
 * El circuito que se está editando.
 *
 * Guarda los elementos, avisa cuando cambian y lleva el historial de deshacer. Hacia fuera
 * es de solo lectura: quien lo usa pide cambios y lee `elements`, nunca toca el mapa de
 * dentro. Eso es lo que permite que el lienzo, la simulación y el deshacer se apoyen en el
 * mismo sitio.
 *
 * **El deshacer es de fotos, no de órdenes.** Cada acción apila una foto de cómo estaba el
 * documento antes de empezarla, y deshacer es volver a ponerla. Es lo que hace el original en
 * `DataPersistent/SnapStore.cs` (versiones de tipo *Edit/Undo/Redo*), y aquí sale casi gratis
 * porque los elementos ya son inmutables: una foto es una lista de referencias. La alternativa
 * —una orden con su inversa por cada tipo de cambio— sería mucho más código y un fallo
 * distinto por cada orden que alguien escriba mal.
 *
 * De momento hay un solo circuito —la hoja principal—; los subcircuitos llegan en M2, y
 * por eso cada elemento ya lleva su `circuitId`.
 *
 * ⚠️ Aquí no hay nada de dibujado ni de simulación: esto es el **documento**. Qué vale un
 * cable lo dice el motor (`core/simulate/`), y cómo se pinta, el renderizador.
 */

import { deviceBounds, deviceLayout, pinPosition } from './layout'
import type { Button, CircuitInstance, Constant, Element, Gate, GateType, GridPoint, GridRect, Id, Layer, Pin, PinSide, PinType, Rotation, Splitter, StoredElement, Wire } from './types'
import { DEFAULT_LAYER_ID, MAX_BIT_WIDTH } from './types'

/** El circuito de la hoja principal. El original lo llama `LogicalCircuit`. */
export const MAIN_CIRCUIT_ID = 'main'

/**
 * Cuántas acciones se recuerdan.
 *
 * El original no pone tope —su `SnapStore` guarda versiones y va olvidando las anteriores a
 * `minUndo`—, pero aquí un tope acota la memoria sin que se note: nadie deshace cien veces.
 */
const MAX_HISTORY = 100

/**
 * Una foto del documento: sus elementos y sus capas.
 *
 * Se copian **las listas**, no los elementos. Cada elemento y cada capa son inmutables
 * —cualquier cambio los sustituye por otro objeto—, así que comparar dos fotos es comparar
 * referencias: barato y exacto, y sin clonar nada.
 *
 * ⚠️ Las capas van incluidas a propósito: sin ellas, deshacer una operación de capas
 * (crear, borrar, renombrar, mover a otra, mostrar/ocultar) no restauraba nada y dejaba el
 * modelo a medias. Eso era un fallo real de M5-19.
 */
interface Snapshot {
  readonly elements: readonly StoredElement[]
  readonly layers: readonly Layer[]
}

/** El documento: los elementos colocados, sus capas y nada más. */
export class Diagram {
  private readonly items = new Map<Id, StoredElement>()
  private layers: Layer[] = [{ id: DEFAULT_LAYER_ID, name: 'Principal', visible: true, locked: false, color: '#888888', opacity: 1 }]
  private readonly listeners = new Set<() => void>()
  private counter = 0
  private layerCounter = 0
  private revisionCount = 0

  /**
   * El circuito al que pertenece este diagrama. Todo lo que se cree aquí lleva este
   * `circuitId`, para que un elemento de un subcircuito no diga que es de la hoja principal.
   * (Antes se grababa siempre `MAIN_CIRCUIT_ID`, y eso rompía la jerarquía al simular y al
   * guardar.)
   */
  constructor(private readonly circuitId: Id = MAIN_CIRCUIT_ID) {}

  /** Las fotos de antes de cada acción, la más reciente al final. */
  private readonly undoStack: Snapshot[] = []
  private readonly redoStack: Snapshot[] = []
  /** La foto que se está tomando ahora mismo, mientras hay una acción abierta. */
  private pending: Snapshot | null = null
  /** Cuántas acciones hay abiertas a la vez: mientras sea `> 0`, todo cuenta como una. */
  private depth = 0

  /**
   * Sube cada vez que algo cambia. Sirve para no recalcular de más: si el número no ha
   * cambiado, ni la escena ni la simulación pueden haber cambiado.
   */
  get revision(): number {
    return this.revisionCount
  }

  /**
   * **Todos** los elementos guardados, en orden de creación (el del fichero).
   *
   * Es la vista que usan la simulación y la persistencia: les da igual si el editor sabe
   * dibujar un pin o un repartidor, y el orden de creación importa (numera los pines de un
   * repartidor y las puntas de un subcircuito).
   */
  get storedElements(): StoredElement[] {
    return [...this.items.values()]
  }

  /**
   * Los elementos que el editor sabe dibujar (compuertas, interruptores y cables),
   * ordenados por capa (z-order) y, dentro de una capa, por orden de creación.
   *
   * El orden por capa es lo que pinta «una capa encima de otra»: la primera del array se
   * dibuja debajo. `Array.prototype.sort` es estable desde ES2019, así que dentro de cada
   * capa se respeta el orden de creación sin necesidad de desempatar a mano.
   */
  get elements(): Element[] {
    return this.drawables(this.storedElements)
  }

  /** Solo los elementos dibujables de capas visibles, ordenados por capa. */
  get visibleElements(): Element[] {
    const visible = new Set(this.layers.filter((l) => l.visible).map((l) => l.id))
    return this.drawables(this.storedElements.filter((e) => visible.has(e.layerId)))
  }

  /**
   * Ordena por capa y se queda con lo que el lienzo sabe pintar.
   *
   * Se filtra **antes** de ordenar para no pagar el `sort` por elementos que luego se
   * tiran, y se hace en una sola pasada de asignación de orden en vez de un `find` por
   * comparación (que sería O(n·capas·log n)).
   */
  private drawables(items: readonly StoredElement[]): Element[] {
    const layerOrder = new Map<Id, number>()
    this.layers.forEach((layer, index) => layerOrder.set(layer.id, index))
    const result: Element[] = []
    for (const item of items) {
      if (item.kind === 'gate' || item.kind === 'button' || item.kind === 'wire') {
        result.push(item)
      }
    }
    return result.sort(
      (a, b) => (layerOrder.get(a.layerId) ?? 0) - (layerOrder.get(b.layerId) ?? 0),
    )
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

  // ── Deshacer y rehacer ────────────────────────────────────────────────

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /**
   * Abre una acción: desde aquí y hasta el `endChange` que la cierre, todos los cambios
   * cuentan como **uno solo** para deshacer.
   *
   * Hace falta porque un gesto del usuario llama muchas veces al modelo: arrastrar un símbolo
   * son decenas de `move`, uno por cada movimiento del ratón, y deshacer tiene que devolverlo
   * a donde estaba **antes de empezar el arrastre**, no un píxel atrás. Se pueden anidar: la
   * de dentro se funde con la de fuera.
   */
  beginChange(): void {
    if (this.depth === 0) {
      this.pending = this.snapshot()
    }
    this.depth += 1
  }

  /**
   * Cierra la acción abierta. Si de verdad ha cambiado algo se apila para deshacer; si no
   * —un clic que no movió nada, una colocación rechazada— se tira sin dejar rastro.
   */
  endChange(): void {
    if (this.depth === 0) {
      return
    }
    this.depth -= 1
    if (this.depth !== 0) {
      return
    }

    const before = this.pending
    this.pending = null
    if (before === null || sameSnapshot(before, this.snapshot())) {
      return
    }

    this.undoStack.push(before)
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift()
    }
    // Cualquier acción nueva invalida lo que se hubiera deshecho, como en todas partes.
    this.redoStack.length = 0

    // El aviso de dentro de la acción salió **antes** de que esto se apilara, así que quien
    // mire `canUndo` para pintar la barra habría visto el estado viejo. Se avisa otra vez.
    this.changed()
  }

  /** Deshace la última acción. Dice si había algo que deshacer. */
  undo(): boolean {
    const previous = this.undoStack.pop()
    if (previous === undefined) {
      return false
    }
    this.redoStack.push(this.snapshot())
    this.restore(previous)
    return true
  }

  /** Rehace la última acción deshecha. */
  redo(): boolean {
    const next = this.redoStack.pop()
    if (next === undefined) {
      return false
    }
    this.undoStack.push(this.snapshot())
    this.restore(next)
    return true
  }

  /** La foto del estado actual. Copia las listas para que nadie las pueda mutar por detrás. */
  private snapshot(): Snapshot {
    return { elements: this.storedElements, layers: [...this.layers] }
  }

  /**
   * Deja el documento como en la foto.
   *
   * ⚠️ El contador de identificadores **no** se rebobina, y es a propósito: si volviera atrás,
   * una pieza nueva podría recibir el identificador de otra que se deshizo y luego se rehizo,
   * y acabarían dos elementos con el mismo nombre. Que solo suba lo evita para siempre.
   */
  private restore(snapshot: Snapshot): void {
    this.items.clear()
    for (const element of snapshot.elements) {
      this.items.set(element.id, element)
    }
    this.layers = [...snapshot.layers]
    this.changed()
  }

  /** Envuelve una acción: la abre, la hace y la cierra, aunque reviente por el camino. */
  private change<T>(action: () => T): T {
    this.beginChange()
    try {
      return action()
    } finally {
      this.endChange()
    }
  }

  get(id: Id): StoredElement | undefined {
    return this.items.get(id)
  }

  /** Un identificador nuevo. Lleva prefijo para que se lea en los registros al depurar. */
  private nextId(prefix: string): Id {
    this.counter += 1
    return `${prefix}-${this.counter}`
  }

  /**
   * Sube el contador interno para que un identificador importado (`gate-7`) no vuelva a
   * salir. Sin esto, cargar un fichero y colocar una pieza después podía reutilizar el id
   * de una pieza ya cargada y **machacarla**.
   */
  private reserveId(id: Id): void {
    const n = Number.parseInt(id.slice(id.lastIndexOf('-') + 1), 10)
    if (Number.isFinite(n) && n > this.counter) {
      this.counter = n
    }
  }

  private changed(): void {
    this.revisionCount += 1
    for (const listener of this.listeners) {
      listener()
    }
  }

  addGate(
    gateType: GateType,
    position: GridPoint,
    inputCount = 2,
    invertedOutput = false,
    bitWidth = 1,
  ): Gate {
    return this.change(() => {
      const gate: Gate = {
        kind: 'gate',
        id: this.nextId('gate'),
        circuitId: this.circuitId,
        layerId: DEFAULT_LAYER_ID,
        position,
        rotation: 'up',
        gateType,
        inputCount,
        bitWidth: Math.max(1, Math.min(bitWidth, MAX_BIT_WIDTH)),
        invertedOutput,
      }
      this.items.set(gate.id, gate)
      this.changed()
      return gate
    })
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
    options: { readonly isToggle?: boolean; readonly inverted?: boolean; readonly bitWidth?: number } = {},
  ): Button {
    return this.change(() => {
      const button: Button = {
        kind: 'button',
        id: this.nextId('button'),
        circuitId: this.circuitId,
        layerId: DEFAULT_LAYER_ID,
        position,
        rotation: 'up',
        bitWidth: Math.max(1, Math.min(options.bitWidth ?? 1, MAX_BIT_WIDTH)),
        isToggle: options.isToggle ?? false,
        inverted: options.inverted ?? false,
      }
      this.items.set(button.id, button)
      this.changed()
      return button
    })
  }

  /** Coloca un pin de hoja (entrada/salida del circuito). */
  addPin(
    position: GridPoint,
    options: { readonly pinType?: PinType; readonly side?: PinSide; readonly bitWidth?: number; readonly inverted?: boolean; readonly name?: string } = {},
  ): Pin {
    return this.change(() => {
      const pin: Pin = {
        kind: 'pin',
        id: this.nextId('pin'),
        circuitId: this.circuitId,
        layerId: DEFAULT_LAYER_ID,
        position,
        rotation: 'up',
        pinType: options.pinType ?? 'input',
        side: options.side ?? 'left',
        bitWidth: Math.max(1, Math.min(options.bitWidth ?? 1, MAX_BIT_WIDTH)),
        inverted: options.inverted ?? false,
        name: options.name ?? '',
      }
      this.items.set(pin.id, pin)
      this.changed()
      return pin
    })
  }

  /** Coloca un valor constante. */
  addConstant(
    position: GridPoint,
    options: { readonly bitWidth?: number; readonly value?: number; readonly pinSide?: PinSide } = {},
  ): Constant {
    return this.change(() => {
      const constant: Constant = {
        kind: 'constant',
        id: this.nextId('constant'),
        circuitId: this.circuitId,
        layerId: DEFAULT_LAYER_ID,
        position,
        rotation: 'up',
        bitWidth: Math.max(1, Math.min(options.bitWidth ?? 1, MAX_BIT_WIDTH)),
        value: options.value ?? 0,
        pinSide: options.pinSide ?? 'right',
      }
      this.items.set(constant.id, constant)
      this.changed()
      return constant
    })
  }

  /** Coloca un repartidor de bits. */
  addSplitter(
    position: GridPoint,
    options: { readonly bitWidth?: number; readonly pinCount?: number; readonly clockwise?: boolean } = {},
  ): Splitter {
    return this.change(() => {
      const splitter: Splitter = {
        kind: 'splitter',
        id: this.nextId('splitter'),
        circuitId: this.circuitId,
        layerId: DEFAULT_LAYER_ID,
        position,
        rotation: 'up',
        bitWidth: Math.max(1, Math.min(options.bitWidth ?? 4, MAX_BIT_WIDTH)),
        pinCount: Math.max(2, options.pinCount ?? 4),
        clockwise: options.clockwise ?? true,
      }
      this.items.set(splitter.id, splitter)
      this.changed()
      return splitter
    })
  }

  /** Coloca un subcircuito (referencia a otro circuito). */
  addCircuitInstance(
    position: GridPoint,
    targetCircuitId: Id,
  ): CircuitInstance {
    return this.change(() => {
      const instance: CircuitInstance = {
        kind: 'circuit',
        id: this.nextId('circuit'),
        circuitId: this.circuitId,
        layerId: DEFAULT_LAYER_ID,
        position,
        rotation: 'up',
        targetCircuitId,
      }
      this.items.set(instance.id, instance)
      this.changed()
      return instance
    })
  }

  /** Lista de capas (solo lectura). */
  get layersList(): readonly Layer[] {
    return this.layers
  }

  /**
   * Reemplaza la lista de capas (carga de ficheros).
   *
   * Se **normaliza** antes de guardar: si el fichero no trae la capa por defecto, se añade
   * al principio, y cualquier elemento que apunte a una capa inexistente se queda en la
   * principal en vez de desaparecer (una capa oculta o inexistente lo volvía invisible).
   */
  setLayers(layers: readonly Layer[]): void {
    const next = layers.map((l) => ({ ...l }))
    if (!next.some((l) => l.id === DEFAULT_LAYER_ID)) {
      next.unshift({ id: DEFAULT_LAYER_ID, name: 'Principal', visible: true, locked: false, color: '#888888', opacity: 1 })
    }
    for (const layer of next) {
      this.reserveLayerId(layer.id)
    }
    const ids = new Set(next.map((l) => l.id))
    for (const [id, el] of this.items) {
      if (!ids.has(el.layerId)) {
        this.items.set(id, { ...el, layerId: DEFAULT_LAYER_ID })
      }
    }
    this.layers = next
    this.changed()
  }

  /** Crea una capa nueva. */
  createLayer(name = 'Nueva capa'): Layer {
    const layer: Layer = {
      id: this.nextLayerId(),
      name,
      visible: true,
      locked: false,
      color: '#888888',
      opacity: 1,
    }
    this.change(() => {
      this.layers = [...this.layers, layer]
      this.changed()
    })
    return layer
  }

  /** Un identificador de capa nuevo. Nunca reutiliza uno borrado. */
  private nextLayerId(): Id {
    this.layerCounter += 1
    return `layer-${this.layerCounter}`
  }

  /** Sube el contador de capas si el id importado (`layer-3`) es mayor que el actual. */
  private reserveLayerId(id: Id): void {
    const n = Number.parseInt(id.slice(id.lastIndexOf('-') + 1), 10)
    if (Number.isFinite(n) && n > this.layerCounter) {
      this.layerCounter = n
    }
  }

  renameLayer(id: Id, name: string): void {
    this.change(() => {
      this.layers = this.layers.map((l) => (l.id === id ? { ...l, name } : l))
      this.changed()
    })
  }

  deleteLayer(id: Id): boolean {
    if (id === DEFAULT_LAYER_ID) return false
    if (!this.layers.some((l) => l.id === id)) return false
    this.change(() => {
      this.layers = this.layers.filter((l) => l.id !== id)
      // Mover elementos de la capa borrada a la por defecto.
      for (const [eid, el] of this.items) {
        if (el.layerId === id) {
          this.items.set(eid, { ...el, layerId: DEFAULT_LAYER_ID })
        }
      }
      this.changed()
    })
    return true
  }

  setLayerVisible(id: Id, visible: boolean): void {
    this.change(() => {
      this.layers = this.layers.map((l) => (l.id === id ? { ...l, visible } : l))
      this.changed()
    })
  }

  setLayerLocked(id: Id, locked: boolean): void {
    this.change(() => {
      this.layers = this.layers.map((l) => (l.id === id ? { ...l, locked } : l))
      this.changed()
    })
  }

  /**
   * Duplica una capa: crea una capa nueva y copia todos los elementos de la origen.
   *
   * Todo va en **una sola** acción de deshacer: crear la capa y copiar los elementos son el
   * mismo gesto del usuario, así que deshacerlo de golpe es lo correcto. (Antes se hacía en
   * dos `change` separados y deshacer solo devolvía la mitad.)
   */
  duplicateLayer(id: Id): Layer | null {
    const src = this.layers.find((l) => l.id === id)
    if (!src) return null
    const newLayer: Layer = {
      id: this.nextLayerId(),
      name: `${src.name} (copia)`,
      visible: src.visible,
      locked: false,
      color: src.color,
      opacity: src.opacity,
    }
    this.change(() => {
      this.layers = [...this.layers, newLayer]
      for (const el of this.items.values()) {
        if (el.layerId === id) {
          const copy = { ...el, id: this.nextId(el.kind), layerId: newLayer.id }
          this.items.set(copy.id, copy)
        }
      }
      this.changed()
    })
    return newLayer
  }

  /** Fusiona una capa en otra: mueve sus elementos y borra la origen. */
  mergeLayer(fromId: Id, intoId: Id): boolean {
    if (fromId === intoId) return false
    if (fromId === DEFAULT_LAYER_ID) return false
    if (!this.layers.some((l) => l.id === fromId)) return false
    if (!this.layers.some((l) => l.id === intoId)) return false
    this.change(() => {
      for (const [eid, el] of this.items) {
        if (el.layerId === fromId) {
          this.items.set(eid, { ...el, layerId: intoId })
        }
      }
      this.layers = this.layers.filter((l) => l.id !== fromId)
      this.changed()
    })
    return true
  }

  moveElementToLayer(elementId: Id, layerId: Id): void {
    const el = this.items.get(elementId)
    if (el === undefined) return
    this.change(() => {
      this.items.set(elementId, { ...el, layerId })
      this.changed()
    })
  }

  selectAllInLayer(layerId: Id): Id[] {
    return [...this.items.values()].filter((e) => e.layerId === layerId).map((e) => e.id)
  }

  isLayerLocked(layerId: Id): boolean {
    return this.layers.find((l) => l.id === layerId)?.locked ?? false
  }

  /**
   * Importa un elemento ya construido (para carga de ficheros). No crea id nuevo, pero
   * reserva su número para que una pieza nueva no lo reutilice.
   */
  importElement(element: StoredElement): void {
    this.reserveId(element.id)
    this.items.set(element.id, element)
    this.changed()
  }

  addWire(p1: GridPoint, p2: GridPoint, bitWidth = 1): Wire {
    return this.change(() => {
      const wire: Wire = {
        kind: 'wire',
        id: this.nextId('wire'),
        circuitId: this.circuitId,
        layerId: DEFAULT_LAYER_ID,
        p1,
        p2,
        bitWidth,
      }
      this.items.set(wire.id, wire)
      this.changed()
      return wire
    })
  }

  /**
   * Fija el color de un cable concreto (M6-14). `undefined` lo devuelve al color del tema.
   *
   * Es una propiedad del elemento, así que pasa por el historial: deshacer un cambio de color
   * tiene que deshacerlo de verdad.
   */
  setWireColor(id: Id, color: string | undefined): void {
    this.setWiresColor([id], color)
  }

  /**
   * Fija el color de varios cables en **un solo paso** de historial (M6-14).
   *
   * Si se llamara a `setWireColor` en bucle, deshacer tendría que pulsarse una vez por cable.
   */
  setWiresColor(ids: readonly Id[], color: string | undefined): void {
    const wires = ids
      .map((id) => this.items.get(id))
      .filter((element): element is Wire => element !== undefined && element.kind === 'wire')
    if (wires.length === 0 || wires.every((wire) => wire.color === color)) {
      return
    }
    this.change(() => {
      for (const wire of wires) {
        if (color === undefined) {
          const { color: _previous, ...rest } = wire
          this.items.set(wire.id, rest)
        } else {
          this.items.set(wire.id, { ...wire, color })
        }
      }
      this.changed()
    })
  }

  /** Mueve un elemento de la rejilla. Los cables se mueven moviendo sus dos puntas. */  move(id: Id, position: GridPoint): void {
    const element = this.items.get(id)
    if (element === undefined || element.kind === 'wire') {
      return
    }
    if (element.position.x === position.x && element.position.y === position.y) {
      return
    }
    this.change(() => {
      this.items.set(id, { ...element, position })
      this.changed()
    })
  }

  rotate(id: Id, clockwise = true): void {
    const element = this.items.get(id)
    if (element === undefined || element.kind === 'wire') {
      return
    }
    this.change(() => {
      const rotations: Rotation[] = ['up', 'right', 'down', 'left']
      const idx = rotations.indexOf(element.rotation)
      const nextIdx = clockwise
        ? (idx + 1) % rotations.length
        : (idx + rotations.length - 1) % rotations.length
      const newRotation = rotations[nextIdx] as Rotation
      // El recolocado solo tiene sentido para símbolos que ya se dibujan; el resto de
      // dispositivos aún no se editan, así que se gira sin más (su caja es 2×2).
      const layout =
        element.kind === 'gate' || element.kind === 'button' ? deviceLayout(element) : { width: 2, height: 2, pins: [] }
      const w = layout.width
      const h = layout.height
      const dx = Math.round((w - h) / 2)
      const dy = Math.round((h - w) / 2)
      this.items.set(id, {
        ...element,
        rotation: newRotation,
        position: { x: element.position.x + dx, y: element.position.y + dy },
      })
      this.changed()
    })
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
    this.change(() => {
      const next: Wire = end === 1 ? { ...element, p1: point } : { ...element, p2: point }
      this.items.set(id, next)
      this.changed()
    })
  }

  remove(id: Id): void {
    this.change(() => {
      if (this.items.delete(id)) {
        this.changed()
      }
    })
  }

  clear(): void {
    if (this.items.size === 0) {
      return
    }
    this.change(() => {
      this.items.clear()
      this.changed()
    })
  }

  /**
   * Los dispositivos que el editor dibuja y edita hoy (compuertas e interruptores) en capas
   * visibles. Los pines, repartidores y subcircuitos no entran todavía: no tienen símbolo.
   */
  get devices(): (Gate | Button)[] {
    const visible = new Set(this.layers.filter((l) => l.visible).map((l) => l.id))
    const result: (Gate | Button)[] = []
    for (const item of this.items.values()) {
      if ((item.kind === 'gate' || item.kind === 'button') && visible.has(item.layerId)) {
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

/** ¿Las dos fotos son la misma? Elementos y capas son inmutables: basta la referencia. */
function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return sameRefs(a.elements, b.elements) && sameRefs(a.layers, b.layers)
}

function sameRefs<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false
    }
  }
  return true
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
