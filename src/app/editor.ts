/**
 * El editor: todo lo que pasa cuando el usuario toca el lienzo.
 *
 * Se saca de `Diagram.svelte` a propósito. Un componente de Svelte es buen sitio para el
 * HTML, pero malo para una máquina de estados con arrastres, cableado y captura de puntero:
 * ahí el estado se mezcla con el ciclo de vida del componente y se vuelve imposible de
 * seguir. Aquí está todo junto y con nombre.
 *
 * El editor es el único que conoce a la vez el documento (`Diagram`), el motor
 * (`MiniEngine`), la vista (`Camera`) y el dibujado (`buildScene`). Es el pegamento, y por
 * eso vive en `app/` y no en `core/` ni en `render/`.
 *
 * Interacción (el original tiene bastantes más cosas: rotar, copiar…):
 *
 * | Gesto                            | Qué hace                            |
 * |----------------------------------|-------------------------------------|
 * | Clic en el vacío                 | quita la selección                  |
 * | Arrastrar en el vacío            | mueve la vista                      |
 * | Rueda                            | acerca, anclado al cursor           |
 * | Clic en un símbolo               | lo selecciona                       |
 * | Arrastrar un símbolo             | lo mueve, pegado a la rejilla        |
 * | Clic en un interruptor           | lo pulsa                            |
 * | Arrastrar desde un pin           | tiende un cable                     |
 * | Clic con el borrador             | borra lo que toque                  |
 * | `Supr` / `Retroceso`             | borra lo seleccionado y sus cables  |
 * | `Ctrl+Z` / `Ctrl+Y`              | deshace / rehace                    |
 * | `Esc`                            | cancela y vuelve a «seleccionar»    |
 *
 * Los atajos de una tecla están puestos en el `title` de cada botón de la barra, que es donde
 * se buscan: `S` seleccionar, `E` borrador, `B` interruptor, `A` compuerta, `L` LED, y `P`
 * para la corriente. `P` es un atajo nuevo: en el original la corriente es `Ctrl+W`, que en un
 * navegador **cierra la pestaña** y no se puede interceptar, así que se cambia por necesidad.
 *
 * Y dos avisos del gesto, que es donde uno se pierde:
 *
 * - Mientras se tiende un cable el cursor es **la flecha**, no la mano: ese gesto va a
 *   conectar, no a mover. Lo pidió el usuario y tiene razón, porque los dos arrastres empiezan
 *   igual.
 * - Con una herramienta de colocación el cursor es la cruz, y con la corriente puesta, la
 *   flecha: si nada se puede mover, una mano abierta mentiría.
 *
 * Los atajos **no** se comen lo que se escribe en un campo de texto (en el lienzo no hay
 * ninguno todavía, pero los diálogos de M2 traen unos cuantos). Y con la corriente puesta solo
 * responden `P` —para apagarla— y `Esc`: lo demás es editar, y con corriente no se edita.
 *
 * Con una herramienta de colocación activa, el clic coloca… **salvo que caiga sobre un
 * símbolo**, y entonces interactúa con él. Eso no es un capricho: la herramienta se queda
 * puesta después de colocar, así que si el clic se lo tragara, pulsar un interruptor recién
 * puesto no haría nada y parecería que el programa se ha muerto.
 *
 * Y por encima de todo eso están los **dos modos**, que gobierna la corriente:
 *
 * - **Apagada (edición)**: todo lo de la tabla de arriba, y ningún dispositivo encendido.
 *   Es como abre la aplicación, y es fiel: en el original `Editor.Power` es
 *   `CircuitRunner != null`, así que hasta que no se enciende no hay corriente.
 * - **Puesta (ejecución)**: el circuito corre y **no se edita nada**. El clic solo pulsa
 *   interruptores, `Supr` no borra y las herramientas se desactivan; el resto del lienzo
 *   sirve para desplazar la vista. Es el modo de prueba que pedía el usuario, y es el
 *   `InEditMode` del original, que desactiva la edición entera mientras el circuito corre.
 */

import { Diagram, MAIN_CIRCUIT_ID } from '../core/model/diagram'
import { CircuitProject } from '../core/model/circuit'
import { placedPins } from '../core/model/layout'
import { connectionCounts, pointKey } from '../core/simulate/nets'
import { Simulation } from './simulation'
import type { SimulationState } from '../core/simulate/engine'
import type { Button, Element, Gate, GridPoint, Id, Wire } from '../core/model/types'
import { Camera } from '../render/camera'
import { Canvas2DRenderer } from '../render/canvas2d'
import { hitTest } from '../render/hit-test'
import type { DrawPinDot, DrawWire, RendererStats } from '../render/ir-renderer'
import { buildScene } from '../render/scene'
import { readTheme, watchTheme } from '../render/theme-bridge'
import {
  MAX_GATE_INPUTS,
  MIN_PIECE_INPUTS,
  findPiece,
  pieceLayout,
  placePiece,
  type PlaceTool,
} from './palette'

/**
 * La herramienta activa.
 *
 * `select` es la de trabajo —elegir, mover y cablear—, `erase` borra lo que se toque con un
 * clic, y las de colocación (`PlaceTool`, la lista de piezas de la paleta) ponen un símbolo
 * nuevo con cada clic.
 *
 * ⚠️ **No hay herramienta de «modo prueba»**: ya existe, y es el botón de corriente. Con la
 * corriente apagada se edita; con la corriente puesta no se toca nada y el clic solo pulsa
 * interruptores. El borrador se queda puesto hasta que se elija otra cosa, igual que las de
 * colocación, porque es un **modo** y no una acción suelta.
 */
export type Tool = 'select' | 'erase' | PlaceTool

/** A partir de cuántas unidades de rejilla un clic se convierte en un arrastre. */
const DRAG_THRESHOLD = 0.45

/** Cuánto se acerca o se aleja por muesca de rueda. */
const WHEEL_SENSITIVITY = 0.0015

/** Margen de la vista inicial, en píxeles. Deja ver el origen del circuito. */
const INITIAL_PADDING_X = 24
const INITIAL_PADDING_Y = 80

/**
 * Por debajo de este zoom, los pines **libres** dejan de dibujarse.
 *
 * Un pin libre es un punto gris de 3 px: con veinte símbolos y la vista alejada son sesenta
 * motas que no informan de nada y ensucian el dibujo. Los conectados se ven siempre, porque
 * esos sí dicen algo. Igual que la rejilla, que también desaparece de cerca, esto es una
 * decisión de dibujado y no afecta al modelo.
 */
const FREE_PIN_MIN_ZOOM = 0.5

/** Si se puede deshacer y rehacer, para que la barra encienda o apague sus botones. */
export interface HistoryState {
  readonly canUndo: boolean
  readonly canRedo: boolean
}

export interface EditorCallbacks {
  readonly onStats?: (stats: RendererStats) => void
  readonly onZoom?: (percent: number) => void
  readonly onSelectionChange?: (id: Id | null) => void
  readonly onPoweredChange?: (powered: boolean) => void
  /**
   * La herramienta ha cambiado. Hace falta porque el editor también la cambia por su cuenta
   * (con `Esc` o con un atajo), y si no avisara, la barra de herramientas seguiría señalando
   * la vieja.
   */
  readonly onToolChange?: (tool: Tool) => void
  /** Se está tendiendo un cable: el cursor tiene que dejar de ser la mano. */
  readonly onWiringChange?: (wiring: boolean) => void
  readonly onHistoryChange?: (history: HistoryState) => void
  /** Sonda sobre un cable: id del cable y su valor (o null si no hay). */
  readonly onHoverChange?: (wireId: string | null, value: number | null, bitWidth: number, x: number, y: number) => void
  /** El circuito activo cambió (navegación entre niveles). */
  readonly onCircuitChange?: (path: readonly Id[]) => void
  /**
   * El circuito que corre tiene un problema: no se puede aplanar (un lazo imposible, una
   * pieza que todavía no se simula) o no se asienta. El original enseña un diálogo; aquí se
   * avisa para que la barra lo ponga en algún sitio, porque simular mal y callarse es peor
   * que no simular.
   */
  readonly onError?: (message: string) => void
}

/** Arrastrando un símbolo. */
interface DragState {
  readonly id: Id
  /** Diferencia entre la esquina del símbolo y la celda que se agarró. */
  readonly grabOffset: GridPoint
  moved: boolean
}

/** Tendiendo un cable. */
interface WireState {
  readonly from: GridPoint
}

/** Un interruptor que se acaba de pulsar. */
interface ButtonPress {
  readonly id: Id
  /** Si estaba pulsado antes, para poder deshacerlo. */
  readonly previous: boolean
}

interface PanState {
  lastX: number
  lastY: number
}

export class Editor {
  /** El proyecto de circuitos (jerarquía). El circuito actual se edita en `diagram`. */
  project: CircuitProject = new CircuitProject()

  /** El diagrama del circuito que se está editando ahora mismo. */
  get diagram(): Diagram {
    return this.project.current.diagram
  }

  /** Pila de circuitos desde la raíz hasta el actual (para el breadcrumb). */
  private circuitPathIds: Id[] = [MAIN_CIRCUIT_ID]

  /**
   * El circuito que corre. Enciende y apaga el motor de verdad y traduce su estado a la foto
   * que el render sabe pintar (ver `simulation.ts`).
   *
   * Los dos avisos que da van a la barra: el repintado, porque un reloj cambia el circuito
   * por su cuenta y sin temporizador del editor no habría forma de enterarse; y el error,
   * porque un circuito que no se puede simular tiene que decirse.
   */
  private readonly simulation = new Simulation({
    onRefresh: () => this.syncSimulation(),
    onError: (message) => this.callbacks.onError?.(message),
  })
  private readonly camera = new Camera()
  private readonly renderer = new Canvas2DRenderer()

  private readonly selected = new Set<Id>()
  private readonly callbacks: EditorCallbacks

  private canvas: HTMLCanvasElement | null = null
  private theme = readTheme()
  private sim: SimulationState = this.simulation.snapshot

  private tool: Tool = 'select'
  /**
   * Cuántas entradas tendrá la próxima compuerta que se coloque.
   *
   * Es cosa del panel, no del circuito: la pieza guarda el número con el que se colocó. Aquí se
   * recuerda para que colocar tres ORs seguidas no obligue a elegir «3» tres veces.
   */
  private inputs = 2
  private pan: PanState | null = null
  private drag: DragState | null = null
  /** Selección por área (M2-19): rectángulo en curso. */
  private areaSelection: { readonly start: GridPoint; current: GridPoint } | null = null
  /** Posiciones iniciales de los elementos seleccionados al empezar a arrastrar (M2-20). */
  private dragGroup: Map<Id, GridPoint> | null = null
  /** Portapapeles en memoria (M2-24). */
  private clipboard: { readonly elements: readonly (Gate | Button)[]; readonly wires: readonly Wire[] } | null = null
  private wire: WireState | null = null
  private buttonPress: ButtonPress | null = null
  /** Última posición del cursor en el mundo, para la previsualización del cable. */
  private cursor: GridPoint | null = null

  /** Lo último que se avisó a la barra, para no repetir el mismo aviso en cada fotograma. */
  private wiring = false
  private history: HistoryState = { canUndo: false, canRedo: false }

  private stopWatchingTheme: (() => void) | null = null
  private unsubscribe: (() => void) | null = null

  constructor(callbacks: EditorCallbacks = {}) {
    this.callbacks = callbacks
  }

  get currentTool(): Tool {
    return this.tool
  }

  get isPowered(): boolean {
    return this.simulation.powered
  }

  get selection(): Id | null {
    return this.selected.values().next().value ?? null
  }

  get elementCount(): number {
    return this.diagram.elements.length
  }

  /** Id del elemento seleccionado (o null). */
  get selectedId(): string | null {
    const first = this.selected.values().next().value
    return first === undefined ? null : first
  }

  /** Qué hay bajo el cursor (para menú contextual). */
  hitAt(clientX: number, clientY: number): ReturnType<typeof hitTest> {
    const rect = this.canvas?.getBoundingClientRect()
    if (rect === undefined) return null
    const world = this.camera.toWorld(clientX - rect.left, clientY - rect.top)
    return hitTest(this.diagram.elements, world)
  }

  private savedRevision = 0
  get revision(): number {
    return this.diagram.revision
  }
  get dirty(): boolean {
    return this.diagram.revision !== this.savedRevision
  }
  markSaved(): void {
    this.savedRevision = this.diagram.revision
  }

  /** Carga un proyecto completo, reemplazando el actual. */
  loadProject(project: CircuitProject): void {
    this.project = project
    this.circuitPathIds = [MAIN_CIRCUIT_ID]
    this.savedRevision = this.diagram.revision
    this.evaluate()
    this.refresh()
    this.callbacks.onCircuitChange?.(this.circuitPath)
  }

  /** Encuadra todo el contenido en el viewport. */
  fitToContent(): void {
    const canvas = this.canvas
    if (canvas === null) return
    const elements = this.diagram.elements
    if (elements.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const el of elements) {
      if (el.kind === 'wire') {
        minX = Math.min(minX, el.p1.x, el.p2.x)
        minY = Math.min(minY, el.p1.y, el.p2.y)
        maxX = Math.max(maxX, el.p1.x, el.p2.x)
        maxY = Math.max(maxY, el.p1.y, el.p2.y)
      } else {
        minX = Math.min(minX, el.position.x)
        minY = Math.min(minY, el.position.y)
        maxX = Math.max(maxX, el.position.x + 2)
        maxY = Math.max(maxY, el.position.y + 2)
      }
    }
    const padding = 2
    const worldW = (maxX - minX + padding * 2)
    const worldH = (maxY - minY + padding * 2)
    const zoomX = (canvas.clientWidth - 40) / (worldW * 18)
    const zoomY = (canvas.clientHeight - 40) / (worldH * 18)
    const zoom = Math.min(Math.max(Math.min(zoomX, zoomY), 0.2), 4)
    this.camera.zoom = zoom
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    this.camera.setOffset(canvas.clientWidth / 2 - centerX * 18 * zoom, canvas.clientHeight / 2 - centerY * 18 * zoom)
    this.refresh()
    this.callbacks.onZoom?.(Math.round(this.camera.zoom * 100))
  }

  get canUndo(): boolean {
    return this.diagram.canUndo
  }

  get canRedo(): boolean {
    return this.diagram.canRedo
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────

  mount(canvas: HTMLCanvasElement): void {
    this.unmount()
    this.canvas = canvas

    this.renderer.init(canvas, {
      onStats: (stats) => this.callbacks.onStats?.(stats),
    })

    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKeyDown)

    // El color del lienzo se recalcula solo al cambiar de tema, nunca por fotograma.
    this.stopWatchingTheme = watchTheme(() => {
      this.theme = readTheme()
      this.refresh()
    })

    // Cualquier cambio del documento se recalcula y se repinta en un solo sitio.
    this.unsubscribe = this.diagram.subscribe(() => {
      this.evaluate()
      this.refresh()
    })

    this.camera.reset(INITIAL_PADDING_X, INITIAL_PADDING_Y)
    this.evaluate()
    this.refresh()
  }

  unmount(): void {
    const canvas = this.canvas
    if (canvas !== null) {
      canvas.removeEventListener('pointerdown', this.onPointerDown)
      canvas.removeEventListener('pointermove', this.onPointerMove)
      canvas.removeEventListener('pointerup', this.onPointerUp)
      canvas.removeEventListener('pointercancel', this.onPointerUp)
      canvas.removeEventListener('wheel', this.onWheel)
    }
    window.removeEventListener('keydown', this.onKeyDown)

    this.stopWatchingTheme?.()
    this.stopWatchingTheme = null
    this.unsubscribe?.()
    this.unsubscribe = null

    // El reloj del circuito, si lo había, no puede quedarse corriendo sin editor.
    this.simulation.dispose()

    this.renderer.destroy()
    this.canvas = null
  }

  // ── Órdenes de la interfaz ────────────────────────────────────────────

  setTool(tool: Tool): void {
    if (this.tool === tool) {
      return
    }
    this.tool = tool
    this.callbacks.onToolChange?.(tool)
  }

  /** Cuántas entradas tendrá la próxima compuerta que se coloque. */
  get placeInputs(): number {
    return this.inputs
  }

  /**
   * Fija cuántas entradas tendrá la próxima compuerta y **devuelve el número aceptado**.
   *
   * Devuelve en vez de callarse porque quien lo pide es un campo de la interfaz: si se escribe
   * un 99, el editor coloca 18 (`MAX_GATE_INPUTS`) y el campo tiene que enseñar ese 18 y no
   * quedarse mintiendo con el 99.
   */
  setPlaceInputs(count: number): number {
    const accepted = Math.max(MIN_PIECE_INPUTS, Math.min(MAX_GATE_INPUTS, Math.trunc(count)))
    this.inputs = Number.isFinite(accepted) ? accepted : MIN_PIECE_INPUTS
    return this.inputs
  }

  /**
   * Enciende o apaga la corriente.
   *
   * Es el **interruptor de modo**: con corriente el circuito corre y no se edita nada; sin
   * ella, se edita con todo apagado. Al encender se quita la selección y se cancela lo que
   * hubiera a medias, igual que hace el original al dar corriente (`Editor.Power` llama a
   * `CancelMove` y `ClearSelection`).
   */
  setPowered(powered: boolean): void {
    this.simulation.setPowered(powered)

    if (powered) {
      // Si se enciende en mitad de un gesto, el gesto se queda a medias: se cierra la acción
      // abierta para que lo movido hasta ahí siga siendo **una sola** para deshacer.
      this.endDrag()
      this.endWire()
      this.buttonPress = null
      this.select(null)
    }

    this.callbacks.onPoweredChange?.(powered)
    this.evaluate()
    this.refresh()
  }

  /**
   * Deshace la última acción. Con la corriente puesta no se edita, así que tampoco se deshace.
   *
   * El historial vive en el documento (`Diagram.undo`), que guarda fotos del circuito, así que
   * aquí solo queda reaccionar: la selección puede estar apuntando a algo que ya no existe.
   */
  undo(): boolean {
    if (this.simulation.powered) {
      return false
    }
    const done = this.diagram.undo()
    if (done) {
      this.afterUndoRedo()
    }
    return done
  }

  /** Rehace la última acción deshecha. */
  redo(): boolean {
    if (this.simulation.powered) {
      return false
    }
    const done = this.diagram.redo()
    if (done) {
      this.afterUndoRedo()
    }
    return done
  }

  clear(): void {
    this.diagram.clear()
    this.simulation.reset()
    this.select(null)
  }

  /** Rota la selección 90° en sentido horario (M2-25). */
  rotateSelection(clockwise = true): void {
    if (this.selected.size === 0) return
    this.diagram.beginChange()
    for (const id of [...this.selected]) {
      const device = this.diagram.get(id)
      if (device === undefined || device.kind === 'wire') continue
      const oldPins = placedPins(device as Gate | Button)
      const oldPoints = oldPins.map((p) => p.point)
      this.diagram.rotate(id, clockwise)
      const newDevice = this.diagram.get(id)
      if (newDevice === undefined || newDevice.kind === 'wire') continue
      const newPins = placedPins(newDevice as Gate | Button)
      // Mover los cables adjuntos: cada extremo que estaba en un pin viejo va al pin nuevo.
      const attached = attachedWires(this.diagram.elements, newDevice as Gate | Button)
      const pinMap = new Map<string, GridPoint>()
      for (let i = 0; i < oldPoints.length && i < newPins.length; i++) {
        pinMap.set(pointKey(oldPoints[i]!), newPins[i]!.point)
      }
      for (const wire of attached) {
        const np1 = pinMap.get(pointKey(wire.p1))
        const np2 = pinMap.get(pointKey(wire.p2))
        if (np1 !== undefined) {
          this.diagram.moveWireEnd(wire.id, 1, np1)
        }
        if (np2 !== undefined) {
          this.diagram.moveWireEnd(wire.id, 2, np2)
        }
      }
    }
    this.diagram.endChange()
    this.refresh()
  }

  /** Copia la selección al portapapeles en memoria (M2-24). */
  copy(): void {
    const ids = new Set(this.selected)
    const elements = this.diagram.elements.filter(
      (e): e is Gate | Button => e.kind !== 'wire' && ids.has(e.id),
    )
    const selectedPinPoints = new Set<string>()
    for (const el of elements) {
      for (const placed of placedPins(el)) {
        selectedPinPoints.add(pointKey(placed.point))
      }
    }
    const wires = this.diagram.elements.filter((e): e is Wire => {
      if (e.kind !== 'wire') return false
      if (ids.has(e.id)) return true
      return selectedPinPoints.has(pointKey(e.p1)) && selectedPinPoints.has(pointKey(e.p2))
    })
    this.clipboard = { elements, wires }
  }

  /** Pega el portapapeles con un offset de +1,+1 (M2-24). */
  paste(): void {
    if (this.clipboard === null || this.clipboard.elements.length === 0) return
    this.diagram.beginChange()
    const idMap = new Map<Id, Id>()
    for (const el of this.clipboard.elements) {
      let newId: Id
      if (el.kind === 'gate') {
        const g = this.diagram.addGate(el.gateType, { x: el.position.x + 1, y: el.position.y + 1 }, el.inputCount, el.invertedOutput, el.bitWidth)
        newId = g.id
      } else {
        const b = this.diagram.addButton({ x: el.position.x + 1, y: el.position.y + 1 }, { isToggle: el.isToggle, inverted: el.inverted, bitWidth: el.bitWidth })
        newId = b.id
      }
      idMap.set(el.id, newId)
    }
    for (const w of this.clipboard.wires) {
      const p1OnSelected = this.clipboard.elements.some((e) =>
        placedPins(e).some((pp) => pointKey(pp.point) === pointKey(w.p1)),
      )
      const newP1 = p1OnSelected ? { x: w.p1.x + 1, y: w.p1.y + 1 } : w.p1
      const newP2 = { x: w.p2.x + 1, y: w.p2.y + 1 }
      this.diagram.addWire(newP1, newP2, w.bitWidth)
    }
    this.diagram.endChange()
    this.select(null)
    for (const newId of idMap.values()) {
      this.selected.add(newId)
    }
    this.callbacks.onSelectionChange?.(this.selected.values().next().value ?? null)
    this.refresh()
  }

  /** Duplica la selección (M2-24). */
  duplicate(): void {
    this.copy()
    this.paste()
  }

  /** Borra lo seleccionado, con los cables que colgaban de ello (M2-21). */
  removeSelected(): void {
    const id = this.selection
    if (id === null) {
      return
    }
    this.removeElement(id)
    this.select(null)
  }

  /**
   * Borra un elemento. Si es un dispositivo se lleva por delante los cables que colgaban de sus
   * pines, que es lo que evita que queden cables huérfanos apuntando al vacío (M2-21).
   *
   * ⚠️ Un cable con un extremo suelto es **legal** en el modelo —el propio editor los crea al
   * tender un cable a un punto libre—, así que esto no es una regla del documento sino una
   * decisión de edición, y por eso vive aquí y no en `Diagram`.
   */
  private removeElement(id: Id): void {
    const element = this.diagram.get(id)
    if (element === undefined) {
      return
    }

    const attached = element.kind === 'wire' ? [] : attachedWires(this.diagram.elements, element)

    // La pieza y sus cables van en la **misma** acción: deshacer tiene que devolver las dos
    // cosas de una vez, y si no, el primer `Ctrl+Z` dejaría cables colgando de un símbolo que
    // ya ha vuelto.
    this.diagram.beginChange()
    try {
      for (const wire of attached) {
        this.diagram.remove(wire.id)
      }
      this.diagram.remove(id)
    } finally {
      this.diagram.endChange()
    }
  }

  /** Si lo seleccionado acaba de desaparecer, se quita la selección. */
  private forgetSelectionIfGone(): void {
    const id = this.selection
    if (id !== null && this.diagram.get(id) === undefined) {
      this.select(null)
    }
  }

  /**
   * Lo que hay que reponer tras deshacer o rehacer.
   *
   * El documento ya avisa por su cuenta (`Diagram.restore` llama a `changed`), así que esto es
   * solo lo que el documento no sabe: que la selección no puede quedarse apuntando a una pieza
   * que la foto acaba de quitar.
   */
  private afterUndoRedo(): void {
    this.forgetSelectionIfGone()
    this.evaluate()
    this.refresh()
  }

  /**
   * Coloca el circuito de ejemplo del corte vertical: dos interruptores, una AND y un LED.
   *
   * Está aquí, y no en un fichero de ejemplo, porque es la comprobación de M1-15: si esto
   * se enciende, el corte vertical funciona de punta a punta. Las coordenadas están
   * calculadas a mano para que cada cable sea **una recta horizontal**: los pines del
   * ejemplo caen a la misma altura.
   *
   * Todo el ejemplo es **una sola acción** para deshacer: si fueran siete, habría que darle
   * siete veces a `Ctrl+Z` para quitar lo que se puso de una vez.
   */
  loadExample(): void {
    this.diagram.beginChange()
    try {
      this.diagram.clear()
      this.simulation.reset()

      this.diagram.addButton({ x: 2, y: 2 }, { isToggle: true }) // salida en (4, 3)
      this.diagram.addButton({ x: 2, y: 4 }, { isToggle: true }) // salida en (4, 5)
      this.diagram.addGate('and', { x: 8, y: 2 }, 2) // entradas en (8, 3) y (8, 5); salida en (11, 4)
      this.diagram.addGate('led', { x: 14, y: 3 }, 1) // entrada en (14, 4)

      this.diagram.addWire({ x: 4, y: 3 }, { x: 8, y: 3 })
      this.diagram.addWire({ x: 4, y: 5 }, { x: 8, y: 5 })
      this.diagram.addWire({ x: 11, y: 4 }, { x: 14, y: 4 })
    } finally {
      this.diagram.endChange()
    }

    this.select(null)
  }

  // ── Jerarquía (M3-02) ─────────────────────────────────────────────────
  /** Identificador del circuito que se está editando. */
  get currentCircuitId(): Id {
    return this.project.currentCircuitId
  }

  /** La ruta de circuitos desde la raíz hasta el actual. */
  get circuitPath(): readonly Id[] {
    return this.circuitPathIds
  }

  /** Nombres de los circuitos de la ruta, para el breadcrumb. */
  get circuitBreadcrumb(): readonly { readonly id: Id; readonly name: string }[] {
    return this.circuitPathIds.map((id) => {
      const circuit = this.project.circuit(id)
      return { id, name: circuit?.name ?? id }
    })
  }

  /** ¿Se puede subir un nivel? */
  get canExitCircuit(): boolean {
    return this.circuitPathIds.length > 1
  }

  /** Crea un subcircuito nuevo y devuelve su id. No navega a él. */
  createSubcircuit(name?: string): Id {
    const circuit = this.project.createCircuit({ name })
    return circuit.id
  }

  /** Entra a editar un subcircuito. Devuelve false si no existe. */
  enterSubcircuit(id: Id): boolean {
    if (!this.project.openCircuit(id)) return false
    if (!this.circuitPathIds.includes(id)) {
      this.circuitPathIds = [...this.circuitPathIds, id]
    }
    this.selected.clear()
    this.forgetSelectionIfGone()
    this.callbacks.onCircuitChange?.(this.circuitPathIds)
    this.evaluate()
    this.refresh()
    return true
  }

  /** Sube un nivel. Devuelve false si ya estamos en la raíz. */
  exitSubcircuit(): boolean {
    if (this.circuitPathIds.length <= 1) return false
    const parent = this.circuitPathIds[this.circuitPathIds.length - 2] as Id
    this.circuitPathIds = this.circuitPathIds.slice(0, -1)
    this.project.openCircuit(parent)
    this.selected.clear()
    this.forgetSelectionIfGone()
    this.callbacks.onCircuitChange?.(this.circuitPathIds)
    this.evaluate()
    this.refresh()
    return true
  }

  // ── El ratón ──────────────────────────────────────────────────────────

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return
    }
    const canvas = this.canvas
    if (canvas === null) {
      return
    }

    const world = this.worldAt(event)
    const grid = this.gridAt(event)
    const hit = hitTest(this.diagram.elements, world)

    // Modo ejecución: la corriente está puesta, así que el circuito se está probando y no
    // se edita. Es lo que hace el original (`Editor.InEditMode => !Power`: cada manejador del
    // ratón comprueba que se está en modo edición). Aquí el clic solo pulsa interruptores; el
    // resto del lienzo se sigue pudiendo desplazar, que eso no toca nada.
    if (this.simulation.powered) {
      // Un pin cuenta como su símbolo: si se acierta el pin de un interruptor, se pulsa.
      const element = hit === null || hit.kind === 'wire' ? null : hit.element
      canvas.setPointerCapture(event.pointerId)

      if (element !== null && element.kind === 'button') {
        this.pressButton(element)
        this.refresh()
      } else {
        this.pan = { lastX: event.clientX, lastY: event.clientY }
      }
      return
    }

    // El borrador: un clic se lleva lo que toque. Sobre el vacío no hay nada que borrar, así
    // que ahí el arrastre sigue moviendo la vista (y el clic, quitando la selección).
    if (this.tool === 'erase') {
      if (hit !== null) {
        this.removeElement(hit.element.id)
        this.forgetSelectionIfGone()
        this.refresh()
        return
      }
      canvas.setPointerCapture(event.pointerId)
      this.select(null)
      this.pan = { lastX: event.clientX, lastY: event.clientY }
      this.refresh()
      return
    }

    // Con una herramienta de colocación, el clic coloca… salvo que caiga sobre un símbolo,
    // y entonces se interactúa con él. Si no, la herramienta se queda pegada y pulsar un
    // interruptor recién puesto no haría nada, que es justo lo que pasaba.
    if (this.tool !== 'select' && (hit === null || (hit.kind !== 'device' && hit.kind !== 'pin'))) {
      this.place(this.tool, grid)
      return
    }

    canvas.setPointerCapture(event.pointerId)

    if (hit !== null && hit.kind === 'pin') {
      this.startWire(hit.point, world)
      this.refresh()
      return
    }

    if (hit !== null && hit.kind === 'device') {
      const isAlreadySelected = this.selected.has(hit.element.id)
      if (!isAlreadySelected) {
        this.select(hit.element.id)
      }

      const groupIds = isAlreadySelected && this.selected.size > 1 ? [...this.selected] : [hit.element.id]
      const groupPositions = new Map<Id, GridPoint>()
      for (const id of groupIds) {
        const el = this.diagram.get(id)
        if (el !== undefined && el.kind !== 'wire') {
          groupPositions.set(id, { x: el.position.x, y: el.position.y })
        }
      }
      this.dragGroup = groupPositions.size > 1 ? groupPositions : null

      // Ojo: aquí **no** se pulsa el interruptor. En modo edición un clic elige la pieza
      // (para moverla), y el original tampoco deja pulsar con la corriente apagada: su
      // `ButtonControl` solo avisa al circuito si está corriendo
      // (`FunctionButton` engancha el aviso al crearse, y el motor solo existe con corriente).
      this.drag = {
        id: hit.element.id,
        grabOffset: {
          x: hit.element.position.x - grid.x,
          y: hit.element.position.y - grid.y,
        },
        moved: false,
      }
      // La acción empieza aquí, en el clic, y no cuando el símbolo se mueve por primera vez:
      // así la foto que se guarda es la de **antes** del arrastre, que es a donde tiene que
      // volver `Ctrl+Z`. Si el gesto acaba siendo un simple clic, no habrá cambiado nada y la
      // acción se tira sola al cerrarla (`endDrag`).
      this.diagram.beginChange()
      this.refresh()
      return
    }

    if (hit !== null && hit.kind === 'wire') {
      this.select(hit.element.id)
      this.refresh()
      return
    }

    // Selección por área (M2-19): Shift + arrastrar.
    if (event.shiftKey) {
      canvas.setPointerCapture(event.pointerId)
      this.areaSelection = { start: grid, current: grid }
      this.refresh()
      return
    }

    // Nada debajo: se desplaza la vista.
    this.select(null)
    this.pan = { lastX: event.clientX, lastY: event.clientY }
    this.refresh()
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.areaSelection !== null) {
      this.areaSelection.current = this.gridAt(event)
      this.refresh()
      return
    }
    const pan = this.pan
    if (pan !== null) {
      this.camera.panBy(event.clientX - pan.lastX, event.clientY - pan.lastY)
      pan.lastX = event.clientX
      pan.lastY = event.clientY
      this.refresh()
      return
    }

    if (this.wire !== null) {
      this.cursor = this.worldAt(event)
      this.refresh()
      return
    }

    const drag = this.drag
    if (drag === null) {
      // Al pasar por encima de un pin, el cursor deja de ser la mano: ahí se cablea,
      // no se mueve. Así se distingue el gesto antes de apretar.
      const world = this.worldAt(event)
      const hit = hitTest(this.diagram.elements, world)
      if (this.canvas !== null) {
        if (this.tool !== 'select') {
        // Con una herramienta puesta, el cursor es la cruz incluso sobre un pin.
        this.canvas.style.cursor = ''
      } else {
        this.canvas.style.cursor = hit?.kind === 'pin' ? 'default' : ''
      }
      }
      // Sonda: solo sobre cables, para no costar nada cuando no aplica.
      if (hit?.kind === 'wire') {
        const w = hit.element as { id: string; p1: { x: number; y: number }; bitWidth?: number }
        const value = this.sim.nets.get(`${w.p1.x},${w.p1.y}`) ?? 0
        this.callbacks.onHoverChange?.(w.id, value, w.bitWidth ?? 1, event.clientX, event.clientY)
      } else {
        this.callbacks.onHoverChange?.(null, null, 1, event.clientX, event.clientY)
      }
      return
    }

    const world = this.worldAt(event)
    if (!drag.moved) {
      const origin = this.diagram.get(drag.id)
      if (origin === undefined || origin.kind === 'wire') {
        return
      }
      const distance = Math.hypot(
        world.x - (origin.position.x - drag.grabOffset.x),
        world.y - (origin.position.y - drag.grabOffset.y),
      )
      if (distance < DRAG_THRESHOLD) {
        return
      }
      drag.moved = true
      // Iba a ser un arrastre, así que la pulsación del interruptor no cuenta.
      this.cancelButtonPress()
    }

    const grid = this.gridAt(event)
    const device = this.diagram.get(drag.id)

    if (device !== undefined && device.kind !== 'wire') {
      const newPos = { x: grid.x + drag.grabOffset.x, y: grid.y + drag.grabOffset.y }
      const dx = newPos.x - device.position.x
      const dy = newPos.y - device.position.y

      if (this.dragGroup !== null && (dx !== 0 || dy !== 0)) {
        for (const id of this.dragGroup.keys()) {
          const el = this.diagram.get(id)
          if (el === undefined || el.kind === 'wire') continue
          const initial = this.dragGroup.get(id)
          if (initial === undefined) continue
          this.diagram.move(id, { x: initial.x + dx, y: initial.y + dy })
          const attached = event.shiftKey ? [] : attachedWires(this.diagram.elements, el)
          const pins = new Set(placedPins(el).map((placed) => pointKey(placed.point)))
          for (const wire of attached) {
            if (pins.has(pointKey(wire.p1))) {
              this.diagram.moveWireEnd(wire.id, 1, { x: wire.p1.x + dx, y: wire.p1.y + dy })
            }
            if (pins.has(pointKey(wire.p2))) {
              this.diagram.moveWireEnd(wire.id, 2, { x: wire.p2.x + dx, y: wire.p2.y + dy })
            }
          }
        }
      } else if (dx !== 0 || dy !== 0) {
        const attached = event.shiftKey ? [] : attachedWires(this.diagram.elements, device)
        const pins = new Set(placedPins(device).map((placed) => pointKey(placed.point)))
        this.diagram.move(drag.id, newPos)
        for (const wire of attached) {
          if (pins.has(pointKey(wire.p1))) {
            this.diagram.moveWireEnd(wire.id, 1, { x: wire.p1.x + dx, y: wire.p1.y + dy })
          }
          if (pins.has(pointKey(wire.p2))) {
            this.diagram.moveWireEnd(wire.id, 2, { x: wire.p2.x + dx, y: wire.p2.y + dy })
          }
        }
      }
    } else {
      const newPos = { x: grid.x + drag.grabOffset.x, y: grid.y + drag.grabOffset.y }
      this.diagram.move(drag.id, newPos)
    }

  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const canvas = this.canvas
    if (canvas !== null && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }

    this.finishButtonPress()
    this.pan = null

    if (this.wire !== null) {
      const end = this.snappedEnd()
      const from = this.wire.from
      this.endWire()
      if (end !== null && (end.x !== from.x || end.y !== from.y)) {
        this.diagram.addWire(from, end)
      } else {
        this.refresh()
      }
      return
    }

    // El arrastre se acaba: si de verdad movió algo, la acción queda apilada para deshacer; si
    // fue un clic que no movió nada, se cierra vacía y no deja rastro.
    if (this.areaSelection !== null) {
      const rect = this.areaSelection
      this.areaSelection = null
      const x0 = Math.min(rect.start.x, rect.current.x)
      const x1 = Math.max(rect.start.x, rect.current.x)
      const y0 = Math.min(rect.start.y, rect.current.y)
      const y1 = Math.max(rect.start.y, rect.current.y)
      this.select(null)
      for (const element of this.diagram.elements) {
        if (element.kind === 'wire') continue
        const p = element.position
        if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) {
          this.selected.add(element.id)
        }
      }
      this.callbacks.onSelectionChange?.(this.selected.values().next().value ?? null)
      this.dragGroup = null
      this.refresh()
      return
    }

    this.endDrag()
    this.dragGroup = null
    this.refresh()
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const canvas = this.canvas
    if (canvas === null) {
      return
    }
    // Las tablets y algún portátil mandan el delta en líneas, no en píxeles.
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    const rect = canvas.getBoundingClientRect()
    this.camera.zoomAt(
      event.clientX - rect.left,
      event.clientY - rect.top,
      Math.exp(-delta * WHEEL_SENSITIVITY),
    )
    this.refresh()
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Los atajos no pisan lo que se escribe en un campo de texto. En el lienzo todavía no hay
    // ninguno, pero los diálogos de M2 traen unos cuantos, y esto es más barato ponerlo ahora
    // que acordarse después.
    if (isTextEntry(event.target) || event.altKey) {
      return
    }

    // Deshacer y rehacer: `Ctrl+Z` y `Ctrl+Y` son los del original, que se apoya en los mandatos
    // estándar del sistema (`ApplicationCommands.Undo/Redo` en `App.xaml.cs`). `Ctrl+Shift+Z`
    // es de propina, porque mucha gente lo tiene en los dedos.
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase()
      if (key === 'z' || key === 'y') {
        const done = key === 'y' || event.shiftKey ? this.redo() : this.undo()
        if (done) {
          event.preventDefault()
        }
      }
      if (key === 'c') { event.preventDefault(); this.copy(); return }
      if (key === 'v') { event.preventDefault(); this.paste(); return }
      if (key === 'd') { event.preventDefault(); this.duplicate(); return }
      return
    }

    if (event.key === 'Escape') {
      this.cancelButtonPress()
      if (this.wire !== null) {
        this.endWire()
        this.refresh()
      } else {
        this.setTool('select')
      }
      return
    }

    // La corriente se enciende y se apaga desde cualquier modo: es el interruptor de modo. En
    // el original esto es `Ctrl+W`, que en un navegador cierra la pestaña y no se puede
    // interceptar, así que aquí es `P`, que se dice igual en los dos idiomas.
    if (event.key.toLowerCase() === 'p') {
      event.preventDefault()
      if (!event.repeat) {
        this.setPowered(!this.simulation.powered)
      }
      return
    }

    // Con la corriente puesta no se edita, así que los atajos de edición no hacen nada.
    if (this.simulation.powered) {
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selection !== null) {
        event.preventDefault()
        this.removeSelected()
      }
      return
    }

    if (event.key.toLowerCase() === 'r' && this.selected.size > 0) {
      event.preventDefault()
      this.rotateSelection()
      return
    }

    const tool = SHORTCUT_TOOLS[event.key.toLowerCase()]
    if (tool !== undefined) {
      event.preventDefault()
      this.setTool(tool)
    }
  }

  // ── Lo de dentro ──────────────────────────────────────────────────────

  /**
   * Coloca la pieza de la herramienta activa, centrada en la celda donde se hizo clic.
   *
   * El hueco se mide con el modelo (`pieceLayout`), no a ojo: si el dibujo y el hueco libre se
   * calcularan por separado, cualquier día no coincidirían y se apilarían símbolos.
   */
  private place(tool: PlaceTool, grid: GridPoint): void {
    const piece = findPiece(tool)
    const size = pieceLayout(piece, this.placeInputs)
    const position: GridPoint = {
      x: grid.x - Math.floor(size.width / 2),
      y: grid.y - Math.floor(size.height / 2),
    }

    if (this.isOccupied(position, size)) {
      // Ya hay algo ahí: no se apilan símbolos.
      return
    }

    placePiece(this.diagram, piece, position, this.placeInputs)
  }

  /** ¿Hay ya algún símbolo en alguna de las celdas que ocuparía el nuevo? */
  private isOccupied(position: GridPoint, size: { width: number; height: number }): boolean {
    for (let y = 0; y < size.height; y += 1) {
      for (let x = 0; x < size.width; x += 1) {
        if (this.diagram.deviceAt({ x: position.x + x, y: position.y + y }) !== undefined) {
          return true
        }
      }
    }
    return false
  }

  /**
   * Pulsa un interruptor y se acuerda de cómo estaba, para poder deshacerlo.
   *
   * Si el gesto acaba siendo un arrastre, la pulsación no cuenta (`cancelButtonPress`), y
   * si el interruptor es momentáneo, se suelta al levantar el botón (`finishButtonPress`).
   */
  private pressButton(button: Button): void {
    const previous = this.simulation.isPressed(button.id)
    this.simulation.setPressed(button.id, button.isToggle ? !previous : true)
    this.buttonPress = { id: button.id, previous }
    this.evaluate()
  }

  private finishButtonPress(): void {
    const press = this.buttonPress
    if (press === null) {
      return
    }
    this.buttonPress = null

    const element = this.diagram.get(press.id)
    // Un interruptor momentáneo vuelve a 0 al soltar; uno que se queda, se queda.
    if (element !== undefined && element.kind === 'button' && !element.isToggle) {
      this.simulation.setPressed(press.id, false)
      this.evaluate()
      this.refresh()
    }
  }

  private cancelButtonPress(): void {
    const press = this.buttonPress
    if (press === null) {
      return
    }
    this.buttonPress = null
    // Se deshace: el gesto ha resultado ser otra cosa.
    this.simulation.setPressed(press.id, press.previous)
    this.evaluate()
    this.refresh()
  }

  /**
   * Termina el arrastre de un símbolo, si lo había.
   *
   * Se llama al final del gesto y también al encender la corriente, que cancela lo que hubiera
   * a medias: en los dos casos la acción abierta tiene que cerrarse. Si el arrastre no movió
   * nada, `endChange` la descarta sola y el historial no se entera.
   */
  private endDrag(): void {
    const dragging = this.drag !== null
    this.drag = null
    if (dragging) {
      this.diagram.endChange()
    }
  }

  /** Empieza a tender un cable desde un punto, con el cursor ya en su sitio. */
  private startWire(from: GridPoint, cursor: GridPoint): void {
    this.wire = { from }
    this.cursor = cursor
    this.emitWiring(true)
  }

  /** Termina de tender un cable, se suelte donde se suelte. */
  private endWire(): void {
    this.wire = null
    this.cursor = null
    this.emitWiring(false)
  }

  /**
   * Avisa de si se está cableando.
   *
   * Cablear y arrastrar empiezan igual —apretar y tirar—, así que el cursor tiene que decir
   * cuál de los dos gestos es: mientras se tiende un cable es **la flecha**, no la mano. Solo
   * se avisa cuando cambia de verdad, para no tocar la barra en cada fotograma.
   */
  private emitWiring(wiring: boolean): void {
    if (wiring === this.wiring) {
      return
    }
    this.wiring = wiring
    this.callbacks.onWiringChange?.(wiring)
  }

  select(id: Id | null): void {
    if (id === null) {
      if (this.selected.size === 0) {
        return
      }
      this.selected.clear()
      this.callbacks.onSelectionChange?.(null)
      return
    }
    if (this.selected.size === 1 && this.selected.has(id)) {
      return
    }
    this.selected.clear()
    this.selected.add(id)
    this.callbacks.onSelectionChange?.(id)
  }

  /** Dónde acabaría el cable si se soltara ahora: en un pin si se está encima, si no en la rejilla. */
  private snappedEnd(): GridPoint | null {
    const cursor = this.cursor
    const wire = this.wire
    if (cursor === null || wire === null) {
      return null
    }

    const hit = hitTest(this.diagram.elements, cursor)
    if (hit !== null && hit.kind === 'pin') {
      return hit.point
    }
    return { x: Math.round(cursor.x), y: Math.round(cursor.y) }
  }

  private worldAt(event: PointerEvent): GridPoint {
    const canvas = this.canvas
    if (canvas === null) {
      return { x: 0, y: 0 }
    }
    const rect = canvas.getBoundingClientRect()
    return this.camera.toWorld(event.clientX - rect.left, event.clientY - rect.top)
  }

  private gridAt(event: PointerEvent): GridPoint {
    const canvas = this.canvas
    if (canvas === null) {
      return { x: 0, y: 0 }
    }
    const rect = canvas.getBoundingClientRect()
    return this.camera.toGrid(event.clientX - rect.left, event.clientY - rect.top)
  }

  private evaluate(): void {
    this.sim = this.simulation.evaluate(this.diagram.elements)
  }

  /**
   * El circuito que corre ha cambiado **por su cuenta** —el reloj— y hay que repintarlo.
   *
   * No pasa por `evaluate`: la simulación ya tiene el estado evaluado; aquí solo se recoge la
   * foto nueva. El reloj avisa como mucho una vez por fotograma, así que no hay riesgo de
   * repintar doscientas veces por segundo.
   */
  private syncSimulation(): void {
    this.sim = this.simulation.snapshot
    this.refresh()
  }

  private refresh(): void {
    const pinDots: DrawPinDot[] = []
    const sketch: DrawWire[] = []

    // Los pines se ven siempre que se pueda cablear; con la corriente puesta no se cablea,
    // así que sobrarían. Y en modo edición: un pin **conectado** interesa a cualquier zoom,
    // porque es información; uno **libre** es una mota gris, así que solo se dibuja de cerca,
    // o mientras se tiende un cable (que entonces hay que ver dónde se puede acabar).
    const wiring = this.wire !== null
    const showFreePins = this.camera.state.zoom >= FREE_PIN_MIN_ZOOM

    // Los pines conectados se ven siempre (incluso con la corriente puesta), porque son
    // información del cableado. Los libres solo tienen sentido editando: con corriente
    // sobran, y en edición se ocultan si no hay zoom suficiente para no ser ruido.
    const counts = connectionCounts(this.diagram.elements)

    for (const device of this.diagram.devices) {
      for (const placed of placedPins(device)) {
        // Un pin negado **ya se ve**: es la bolita que dibuja la silueta (una NAND es una
        // AND con la salida negada). Pintarle encima el puntito dejaría una mota dentro.
        if (placed.pin.inverted) {
          continue
        }
        const connected = (counts.get(pointKey(placed.point)) ?? 0) > 1
        if (!connected) {
          if (this.simulation.powered) {
            continue
          }
          if (!wiring && !showFreePins) {
            continue
          }
        }
        pinDots.push({
          kind: 'pinDot',
          point: placed.point,
          connected,
          emphasized: wiring,
        })
      }
    }

    if (wiring) {
      const end = this.snappedEnd()
      if (end !== null && this.wire !== null) {
        sketch.push({ kind: 'wire', p1: this.wire.from, p2: end, selected: false })
      }
    }

    this.renderer.render(
      buildScene({
        elements: this.diagram.elements,
        states: this.sim.devices,
        selected: this.selected,
        camera: this.camera.state,
        theme: this.theme,
        showGrid: true,
        pinDots,
        sketch,
      }),
    )

    // Dibuja el rectángulo de selección por área (M2-19) sobre el canvas.
    if (this.areaSelection !== null && this.canvas !== null) {
      const ctx = this.canvas.getContext('2d')
      if (ctx !== null) {
        const rect = this.areaSelection
        const x0 = Math.min(rect.start.x, rect.current.x)
        const y0 = Math.min(rect.start.y, rect.current.y)
        const x1 = Math.max(rect.start.x, rect.current.x)
        const y1 = Math.max(rect.start.y, rect.current.y)
        const zoom = this.camera.state.zoom
        const grid = 18
        const dpr = window.devicePixelRatio || 1
        const px0 = (this.camera.state.offsetX + x0 * grid * zoom) * dpr
        const py0 = (this.camera.state.offsetY + y0 * grid * zoom) * dpr
        const pw = (x1 - x0 + 1) * grid * zoom * dpr
        const ph = (y1 - y0 + 1) * grid * zoom * dpr
        ctx.save()
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)'
        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'
        ctx.lineWidth = 1
        ctx.fillRect(px0, py0, pw, ph)
        ctx.strokeRect(px0, py0, pw, ph)
        ctx.restore()
      }
    }

    this.callbacks.onZoom?.(Math.round(this.camera.zoom * 100))
    this.emitHistory()
  }

  /**
   * Avisa de si se puede deshacer o rehacer.
   *
   * Va al final de cada `refresh` porque el historial cambia **después** de que el documento
   * avise del cambio: la acción se apila al cerrarse, y hasta entonces el cambio ya se ha
   * contado. Deducirlo de los avisos del documento daría un botón apagado justo cuando hay algo
   * que deshacer. Solo se avisa cuando el par cambia, y no en cada fotograma.
   */
  private emitHistory(): void {
    const canUndo = this.diagram.canUndo
    const canRedo = this.diagram.canRedo
    if (canUndo === this.history.canUndo && canRedo === this.history.canRedo) {
      return
    }
    this.history = { canUndo, canRedo }
    this.callbacks.onHistoryChange?.(this.history)
  }
}

/**
 * Los atajos de una tecla a cada herramienta. Son los mismos que anuncia el `title` de cada
 * botón —el de la barra y el de la paleta—, que es donde la gente los busca: `S` seleccionar,
 * `E` borrador, `B` interruptor, `A` compuerta AND y `L` LED.
 *
 * Solo hay cinco porque solo hay cinco que se usen a cada rato; el resto de piezas se eligen en
 * la paleta, que para eso está.
 */
const SHORTCUT_TOOLS: Readonly<Record<string, Tool | undefined>> = {
  s: 'select',
  e: 'erase',
  b: 'button',
  a: 'and',
  l: 'led',
}

/**
 * Los cables que cuelgan de los pines de un dispositivo.
 *
 * Se mira pin a pin: un cable está colgando de una pieza si **una de sus dos puntas** cae justo
 * encima de uno de sus pines. Los pines no se guardan en el dispositivo —`layout.ts` los deduce
 * del tipo y del tamaño— así que la cuenta se hace preguntando por sitios, no por nombres.
 */
function attachedWires(elements: readonly Element[], device: Gate | Button): Wire[] {
  const pins = new Set(placedPins(device).map((placed) => pointKey(placed.point)))
  const found: Wire[] = []

  for (const element of elements) {
    if (element.kind !== 'wire') {
      continue
    }
    if (pins.has(pointKey(element.p1)) || pins.has(pointKey(element.p2))) {
      found.push(element)
    }
  }

  return found
}

/** ¿El evento viene de un campo de texto? Entonces los atajos no pintan nada. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}
