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
 * Interacción de M1 (el original tiene bastantes más cosas: rotar, deshacer, copiar…):
 *
 * | Gesto                            | Qué hace                          |
 * |----------------------------------|-----------------------------------|
 * | Clic en el vacío                 | quita la selección                |
 * | Arrastrar en el vacío            | mueve la vista                    |
 * | Rueda                            | acerca, anclado al cursor         |
 * | Clic en un símbolo               | lo selecciona                     |
 * | Arrastrar un símbolo             | lo mueve, pegado a la rejilla      |
 * | Clic en un interruptor           | lo pulsa                          |
 * | Arrastrar desde un pin           | tiende un cable                   |
 * | `Supr` / `Retroceso`             | borra lo seleccionado             |
 * | `Esc`                            | cancela y vuelve a «seleccionar»  |
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

import { Diagram } from '../core/model/diagram'
import { gateLayout, placedPins } from '../core/model/layout'
import { connectionCounts, pointKey } from '../core/simulate/nets'
import { MiniEngine, emptySimulationState, type SimulationState } from '../core/simulate/engine'
import type { Button, GridPoint, Id } from '../core/model/types'
import { Camera } from '../render/camera'
import { Canvas2DRenderer } from '../render/canvas2d'
import { hitTest } from '../render/hit-test'
import type { DrawPinDot, DrawWire, RendererStats } from '../render/ir-renderer'
import { buildScene } from '../render/scene'
import { readTheme, watchTheme } from '../render/theme-bridge'

/** Qué coloca una herramienta. */
export type PlaceTool = 'button' | 'and' | 'led'

/**
 * La herramienta activa.
 *
 * `select` es la de trabajo —elegir, mover y cablear— y las de colocación ponen un símbolo
 * nuevo con cada clic.
 *
 * ⚠️ **No hay herramienta de «modo prueba»**: ya existe, y es el botón de corriente. Con la
 * corriente apagada se edita; con la corriente puesta no se toca nada y el clic solo pulsa
 * interruptores. Ver [`Tool`] y `onPointerDown`.
 */
export type Tool = 'select' | PlaceTool

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

export interface EditorCallbacks {
  readonly onStats?: (stats: RendererStats) => void
  readonly onZoom?: (percent: number) => void
  readonly onSelectionChange?: (id: Id | null) => void
  readonly onPoweredChange?: (powered: boolean) => void
  /**
   * La herramienta ha cambiado. Hace falta porque el editor también la cambia por su cuenta
   * (con `Esc`), y si no avisara, la barra de herramientas seguiría señalando la vieja.
   */
  readonly onToolChange?: (tool: Tool) => void
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
  readonly diagram = new Diagram()

  private readonly engine = new MiniEngine()
  private readonly camera = new Camera()
  private readonly renderer = new Canvas2DRenderer()

  private readonly selected = new Set<Id>()
  private readonly callbacks: EditorCallbacks

  private canvas: HTMLCanvasElement | null = null
  private theme = readTheme()
  private sim: SimulationState = emptySimulationState()

  private tool: Tool = 'select'
  private pan: PanState | null = null
  private drag: DragState | null = null
  private wire: WireState | null = null
  private buttonPress: ButtonPress | null = null
  /** Última posición del cursor en el mundo, para la previsualización del cable. */
  private cursor: GridPoint | null = null

  private stopWatchingTheme: (() => void) | null = null
  private unsubscribe: (() => void) | null = null

  constructor(callbacks: EditorCallbacks = {}) {
    this.callbacks = callbacks
  }

  get currentTool(): Tool {
    return this.tool
  }

  get isPowered(): boolean {
    return this.engine.powered
  }

  get selection(): Id | null {
    return this.selected.values().next().value ?? null
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

  /**
   * Enciende o apaga la corriente.
   *
   * Es el **interruptor de modo**: con corriente el circuito corre y no se edita nada; sin
   * ella, se edita con todo apagado. Al encender se quita la selección y se cancela lo que
   * hubiera a medias, igual que hace el original al dar corriente (`Editor.Power` llama a
   * `CancelMove` y `ClearSelection`).
   */
  setPowered(powered: boolean): void {
    this.engine.setPowered(powered)

    if (powered) {
      this.drag = null
      this.wire = null
      this.buttonPress = null
      this.cursor = null
      this.select(null)
    }

    this.callbacks.onPoweredChange?.(powered)
    this.evaluate()
    this.refresh()
  }

  clear(): void {
    this.diagram.clear()
    this.engine.reset()
    this.selected.clear()
    this.callbacks.onSelectionChange?.(null)
  }

  removeSelected(): void {
    const id = this.selection
    if (id === null) {
      return
    }
    this.diagram.remove(id)
    this.selected.delete(id)
    this.callbacks.onSelectionChange?.(null)
  }

  /**
   * Coloca el circuito de ejemplo del corte vertical: dos interruptores, una AND y un LED.
   *
   * Está aquí, y no en un fichero de ejemplo, porque es la comprobación de M1-15: si esto
   * se enciende, el corte vertical funciona de punta a punta. Las coordenadas están
   * calculadas a mano para que cada cable sea **una recta horizontal**: los pines del
   * ejemplo caen a la misma altura.
   */
  loadExample(): void {
    this.diagram.clear()
    this.engine.reset()

    this.diagram.addButton({ x: 2, y: 2 }, { isToggle: true }) // salida en (4, 3)
    this.diagram.addButton({ x: 2, y: 4 }, { isToggle: true }) // salida en (4, 5)
    this.diagram.addGate('and', { x: 8, y: 2 }, 2) // entradas en (8, 3) y (8, 5); salida en (11, 4)
    this.diagram.addGate('led', { x: 14, y: 3 }, 1) // entrada en (14, 4)

    this.diagram.addWire({ x: 4, y: 3 }, { x: 8, y: 3 })
    this.diagram.addWire({ x: 4, y: 5 }, { x: 8, y: 5 })
    this.diagram.addWire({ x: 11, y: 4 }, { x: 14, y: 4 })

    this.selected.clear()
    this.callbacks.onSelectionChange?.(null)
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
    if (this.engine.powered) {
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

    // Con una herramienta de colocación, el clic coloca… salvo que caiga sobre un símbolo,
    // y entonces se interactúa con él. Si no, la herramienta se queda pegada y pulsar un
    // interruptor recién puesto no haría nada, que es justo lo que pasaba.
    if (this.tool !== 'select' && (hit === null || hit.kind !== 'device')) {
      this.place(this.tool, grid)
      return
    }

    canvas.setPointerCapture(event.pointerId)

    if (hit !== null && hit.kind === 'pin') {
      this.wire = { from: hit.point }
      this.cursor = world
      this.refresh()
      return
    }

    if (hit !== null && hit.kind === 'device') {
      this.select(hit.element.id)

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
      this.refresh()
      return
    }

    if (hit !== null && hit.kind === 'wire') {
      this.select(hit.element.id)
      this.refresh()
      return
    }

    // Nada debajo: se desplaza la vista.
    this.select(null)
    this.pan = { lastX: event.clientX, lastY: event.clientY }
    this.refresh()
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
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
    this.diagram.move(drag.id, { x: grid.x + drag.grabOffset.x, y: grid.y + drag.grabOffset.y })
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
      this.wire = null
      this.cursor = null
      if (end !== null && (end.x !== from.x || end.y !== from.y)) {
        this.diagram.addWire(from, end)
      } else {
        this.refresh()
      }
      return
    }

    this.drag = null
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
    if (event.key === 'Escape') {
      this.cancelButtonPress()
      if (this.wire !== null) {
        this.wire = null
        this.cursor = null
        this.refresh()
      } else {
        this.setTool('select')
      }
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Con la corriente puesta no se edita, así que tampoco se borra.
      if (!this.engine.powered && this.selection !== null) {
        event.preventDefault()
        this.removeSelected()
      }
    }
  }

  // ── Lo de dentro ──────────────────────────────────────────────────────

  /** Coloca un símbolo nuevo, centrado en la celda donde se hizo clic. */
  private place(tool: PlaceTool, grid: GridPoint): void {
    const size = tool === 'and' ? gateLayout('and', 2) : { width: 2, height: 2 }
    const position: GridPoint = {
      x: grid.x - Math.floor(size.width / 2),
      y: grid.y - Math.floor(size.height / 2),
    }

    if (this.isOccupied(position, size)) {
      // Ya hay algo ahí: no se apilan símbolos.
      return
    }

    switch (tool) {
      case 'and':
        this.diagram.addGate('and', position, 2)
        break
      case 'led':
        this.diagram.addGate('led', position, 1)
        break
      case 'button':
        // La paleta crea un interruptor **fijo**: con el ratón no se pueden pulsar dos a
        // la vez, así que uno momentáneo no serviría para nada en una AND de dos entradas.
        // El modelo, en cambio, respeta el valor por defecto del original (momentáneo).
        this.diagram.addButton(position, { isToggle: true })
        break
    }
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
    const previous = this.engine.isPressed(button.id)
    this.engine.setPressed(button.id, button.isToggle ? !previous : true)
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
      this.engine.setPressed(press.id, false)
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
    this.engine.setPressed(press.id, press.previous)
    this.evaluate()
    this.refresh()
  }

  private select(id: Id | null): void {
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
    this.sim = this.engine.evaluate(this.diagram.elements)
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

    if (!this.engine.powered) {
      const counts = connectionCounts(this.diagram.elements)

      for (const device of this.diagram.devices) {
        for (const placed of placedPins(device)) {
          const connected = (counts.get(pointKey(placed.point)) ?? 0) > 1
          if (!connected && !wiring && !showFreePins) {
            continue
          }
          pinDots.push({
            kind: 'pinDot',
            point: placed.point,
            connected,
            emphasized: wiring,
          })
        }
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

    this.callbacks.onZoom?.(Math.round(this.camera.zoom * 100))
  }
}
