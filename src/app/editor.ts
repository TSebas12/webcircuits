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
import { DEFAULT_LAYER_ID } from '../core/model/types'
import { CircuitProject } from '../core/model/circuit'
import { circuitInstanceLayout, deviceBounds, placedPins } from '../core/model/layout'
import { connectionCounts, pointKey } from '../core/simulate/nets'
import { Simulation, type ProbeChannel } from './simulation'
import type { SimulationState } from '../core/simulate/engine'
import type {
  BusGroup,
  Button,
  Circuit,
  CircuitInstance,
  DrawableDevice,
  Element,
  GridPoint,
  GridRect,
  Id,
  PlacedElement,
  StoredElement,
  Wire,
} from '../core/model/types'
import { Camera, MAX_ZOOM } from '../render/camera'
import { Canvas2DRenderer } from '../render/canvas2d'
import { GRID_SIZE } from '../render/geometry'
import { hitTest, type Hit } from '../render/hit-test'
import type { DrawLabel, DrawPinDot, DrawWire, RendererStats, WireSignal } from '../render/ir-renderer'
import {
  busGeometry,
  busGroupAtFolded,
  planBusGroup,
  type BusGroupHit,
  type FoldedBus,
} from './editor/bus-group'
import { busLabelText } from './editor/bus-label'
import { booleanFunction } from '../core/synthesis/function'
import { minimize } from '../core/synthesis/minimize'
import { synthesizeNetlist } from '../core/synthesis/netlist'
import { verifyNetlist } from '../core/synthesis/verify'
import { routeBusGeometry } from './editor/bus-route'
import { buildScene } from '../render/scene'
import { readTheme, watchTheme } from '../render/theme-bridge'
import { parseHex } from '../core/theme/contrast'
import { loadSettings } from './settings'
import {
  MAX_GATE_INPUTS,
  MIN_PIECE_INPUTS,
  clampSplitterSettings,
  findPiece,
  pieceLayout,
  placePiece,
  splitterDefaults,
  type Piece,
  type PlaceTool,
  type SplitterSettings,
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
export type Tool = 'select' | 'erase' | 'wire' | 'subcircuit' | PlaceTool

/** Lo que puede devolver `Editor.hitAt`: una pieza, un pin, un cable o un bus plegado. */
export type EditorHit = Hit | BusGroupHit

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

/**
 * Convierte un color hexadecimal en `rgba()` con la transparencia dada.
 *
 * El rectángulo de selección por área necesita un color del tema con alfa, y el canvas no
 * entiende `color-mix()`. Si el color no fuera hexadecimal, se devuelve tal cual.
 */
function withAlpha(color: string, alpha: number): string {
  try {
    const { r, g, b } = parseHex(color)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  } catch {
    return color
  }
}

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
   * El documento ha cambiado (colocar, mover, borrar, cablear…).
   *
   * No basta con `onHistoryChange`: ese solo avisa cuando aparece o desaparece la posibilidad
   * de deshacer, así que después de guardar y volver a editar no se enteraría nadie. Este es el
   * aviso que mantiene al día el punto de «sin guardar» y el autoguardado.
   */
  readonly onDocumentChange?: () => void
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

/**
 * Huecos del lienzo que tapa la interfaz (la paleta a la izquierda, sobre todo).
 *
 * La cámara los respeta al arrancar y al encuadrar: si no, el circuito se dibuja debajo de
 * la paleta y parece que el lienzo está vacío. Son píxeles CSS, no unidades de rejilla.
 */
export interface ViewInsets {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

const NO_INSETS: ViewInsets = { left: 0, top: 0, right: 0, bottom: 0 }

/** Tendiendo un cable. */
interface WireState {
  readonly from: GridPoint
}

/**
 * El puntero en el momento de empezar un cable.
 *
 * `moved` distingue los dos gestos que empiezan igual: arrastrar (soltar tiende el cable) y
 * hacer clic (el cable se queda armado para terminarlo con otro clic). Sin esta diferencia,
 * un clic seco en un pin empezaba y acababa un cable de longitud cero, y parecía que el
 * programa no dejaba cablear.
 */
interface WirePress {
  readonly x: number
  readonly y: number
  moved: boolean
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

/**
 * Lo que el editor necesita saber de una foto del documento para dibujar y acertar clics.
 *
 * Se calcula **una vez por gesto**: los buses plegados, los cables que tapan y los elementos
 * que se pueden tocar. Antes cada consulta recorría el documento entero otra vez.
 */
interface SceneIndex {
  readonly elements: readonly Element[]
  readonly folded: FoldedBus[]
  readonly hidden: ReadonlySet<Id>
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
  /** Píxeles del lienzo que tapa la interfaz (la paleta). Se respetan al encuadrar. */
  private insets: ViewInsets = NO_INSETS

  private readonly selected = new Set<Id>()
  private pendingWireColor: string | null = null
  private readonly callbacks: EditorCallbacks

  private canvas: HTMLCanvasElement | null = null
  private theme = readTheme()
  private sim: SimulationState = this.simulation.snapshot

  private tool: Tool = 'select'
  /** ¿Se dibuja la rejilla? Lo decide la preferencia del usuario (M4-10). */
  private showGrid = true
  /** ¿Se imanta el puntero a la rejilla? Lo decide la preferencia del usuario (M4-10). */
  private snapToGrid = true
  /**
   * Cuántas entradas tendrá la próxima compuerta que se coloque.
   *
   * Es cosa del panel, no del circuito: la pieza guarda el número con el que se colocó. Aquí se
   * recuerda para que colocar tres ORs seguidas no obligue a elegir «3» tres veces.
   */
  private inputs = 2
  /**
   * Ajustes elegidos para cada pieza de la paleta, por identificador.
   *
   * Son cosa del panel, no del circuito: la pieza guarda lo que se eligió al colocarla. Se
   * separan por pieza (y no un único número global) porque el original también deja configurar
   * cada compuerta y cada repartidor por su cuenta.
   */
  private readonly paletteInputs = new Map<string, number>()
  private readonly paletteSplitters = new Map<string, SplitterSettings>()
  private pan: PanState | null = null
  private drag: DragState | null = null
  /** Selección por área (M2-19): rectángulo en curso. */
  private areaSelection: { readonly start: GridPoint; current: GridPoint } | null = null
  /** Posiciones iniciales de los elementos seleccionados al empezar a arrastrar (M2-20). */
  private dragGroup: Map<Id, GridPoint> | null = null
  /** Portapapeles en memoria (M2-24). */
  private clipboard: { readonly elements: readonly DrawableDevice[]; readonly wires: readonly Wire[] } | null = null
  /**
   * Circuito que se colocará con la herramienta `subcircuit`.
   *
   * La paleta puede ofrecer varias instancias; esta es la que está elegida. Se guarda aquí,
   * y no en la pieza, porque los subcircuitos no están en el catálogo estático: nacen y
   * mueren con el proyecto.
   */
  private placeCircuit: Id | null = null
  private wire: WireState | null = null
  private wirePress: WirePress | null = null
  private buttonPress: ButtonPress | null = null
  /** Última posición del cursor en el mundo, para la previsualización del cable. */
  private cursor: GridPoint | null = null
  /** Qué hay bajo el cursor, para resaltarlo (M6-06). */
  private hovered: Id | null = null

  /** Lo último que se avisó a la barra, para no repetir el mismo aviso en cada fotograma. */
  private wiring = false
  private history: HistoryState = { canUndo: false, canRedo: false }

  private stopWatchingTheme: (() => void) | null = null
  private unsubscribe: (() => void) | null = null
  private readonly viewListeners = new Set<() => void>()

  constructor(callbacks: EditorCallbacks = {}) {
    this.callbacks = callbacks
  }

  /**
   * Cómo medir un subcircuito.
   *
   * El modelo (`layout.ts`) no conoce el proyecto; el editor sí. Esta función es el puente:
   * se pasa a todo lo que tenga que saber cuánto mide una instancia o dónde tiene sus pines.
   */
  private readonly resolveCircuit = (id: Id): Circuit | undefined => this.project.circuit(id)

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
    return this.diagram.count
  }

  /**
   * Avisa de cada repintado (cambio de documento o de cámara).
   *
   * Lo usa el minimapa para no ir preguntando: se redibuja cuando de verdad cambia algo.
   */
  subscribeView(listener: () => void): () => void {
    this.viewListeners.add(listener)
    return () => {
      this.viewListeners.delete(listener)
    }
  }

  /** Estado de la cámara (para minimap). */
  get cameraState(): { zoom: number; offsetX: number; offsetY: number } {
    return this.camera.state
  }

  /** Tamaño del lienzo en píxeles CSS (para el rectángulo del minimapa). */
  get viewportSize(): { width: number; height: number } {
    const canvas = this.canvas
    if (canvas === null) {
      return { width: 800, height: 600 }
    }
    return { width: canvas.clientWidth, height: canvas.clientHeight }
  }

  /** Id del elemento seleccionado (o null). */
  get selectedId(): string | null {
    const first = this.selected.values().next().value
    return first === undefined ? null : first
  }

  get selectedCount(): number {
    return this.selected.size
  }

  /** ¿Ese elemento está en la selección? Lo usa el menú contextual para no romperla. */
  isSelected(id: Id): boolean {
    return this.selected.has(id)
  }

  /**
   * El bus cuyos cables están seleccionados **todos**, si lo hay.
   *
   * Un bus se selecciona como un objeto: al pulsar la línea se meten sus cables en la
   * selección. Así el resto del editor (borrar, mover de capa, inspector) sigue trabajando con
   * cables normales y no hay que inventar un segundo tipo de selección.
   */
  get selectedBusGroup(): BusGroup | null {
    for (const group of this.diagram.busGroups) {
      if (group.wireIds.length !== this.selected.size) {
        continue
      }
      if (group.wireIds.every((id) => this.selected.has(id))) {
        return group
      }
    }
    return null
  }

  /** ¿Se puede convertir la selección en un bus? */
  get canGroupSelection(): boolean {
    if (this.simulation.powered || this.selected.size < 2) {
      return false
    }
    const wires: Wire[] = []
    for (const id of this.selected) {
      const element = this.diagram.get(id)
      if (
        element === undefined ||
        element.kind !== 'wire' ||
        this.diagram.isLayerLocked(element.layerId) ||
        this.diagram.busGroupForWire(id) !== undefined
      ) {
        return false
      }
      wires.push(element)
    }
    return planBusGroup(wires).ok
  }

  /** ¿La selección es exactamente un bus ya creado? */
  get canUngroupSelection(): boolean {
    return !this.simulation.powered && this.selectedBusGroup !== null
  }

  /** Qué hay bajo el cursor (para menú contextual). */
  hitAt(clientX: number, clientY: number): EditorHit | null {
    const rect = this.canvas?.getBoundingClientRect()
    if (rect === undefined) return null
    const world = this.camera.toWorld(clientX - rect.left, clientY - rect.top)
    const index = this.sceneIndex()
    const hit = hitTest(index.elements, world, this.resolveCircuit)
    if (hit !== null) {
      return hit
    }
    const group = this.busGroupAtPoint(world, index.folded)
    return group === null ? null : { kind: 'bus', group }
  }

  /**
   * Prepara de una pasada lo que necesitan el dibujo y el hit-test.
   *
   * Los buses plegados se resuelven aquí, no en cada consulta: mover el ratón no puede recorrer
   * el documento cinco veces para decidir si hay una línea debajo.
   */
  private sceneIndex(visible: readonly Element[] = this.diagram.visibleElements): SceneIndex {
    const wires = new Map<Id, Wire>()
    for (const element of visible) {
      if (element.kind === 'wire') {
        wires.set(element.id, element)
      }
    }

    // Las piezas son obstáculos para el rutado. Se calculan solo si hay algún bus plegado.
    let obstacles: GridRect[] | null = null
    const deviceObstacles = (): readonly GridRect[] => {
      if (obstacles === null) {
        obstacles = []
        for (const element of visible) {
          if (element.kind !== 'wire') {
            obstacles.push(deviceBounds(element, this.resolveCircuit))
          }
        }
      }
      return obstacles
    }

    const folded: FoldedBus[] = []
    const hidden = new Set<Id>()
    for (const group of this.diagram.busGroups) {
      if (!group.collapsed) {
        continue
      }
      const members: Wire[] = []
      let complete = true
      for (const id of group.wireIds) {
        const wire = wires.get(id)
        if (wire === undefined) {
          complete = false
          break
        }
        members.push(wire)
      }
      if (!complete) {
        continue
      }
      const geometry = busGeometry(group, members)
      if (geometry === null) {
        continue
      }
      // La mediana puede caer encima de una pieza; M3B-02 la mueve al canal libre más cercano.
      folded.push({ group, geometry: routeBusGeometry(geometry, deviceObstacles()) })
      for (const id of group.wireIds) {
        hidden.add(id)
      }
    }

    const elements =
      hidden.size === 0
        ? visible
        : visible.filter((element) => element.kind !== 'wire' || !hidden.has(element.id))

    return { elements, folded, hidden }
  }

  /** El bus plegado bajo un punto del mundo, si lo hay. */
  private busGroupAtPoint(world: GridPoint, folded: readonly FoldedBus[]): BusGroup | null {
    return busGroupAtFolded(folded, world)
  }

  /** Los tramos que hay que pintar para un grupo de buses plegados. */
  private busDrawItems(folded: readonly FoldedBus[]): DrawWire[] {
    const layers = new Map(this.diagram.layersList.map((layer) => [layer.id, layer]))
    const items: DrawWire[] = []

    for (const { group, geometry } of folded) {
      const selected = group.wireIds.every((id) => this.selected.has(id))
      const hovered = this.hovered === group.id
      const layer = layers.get(group.layerId)
      const baseOpacity = layer?.opacity ?? 1
      const dim =
        this.diagram.dimOtherLayers && this.diagram.activeLayerId !== group.layerId ? 0.25 : 1
      const layerOpacity = baseOpacity * dim

      items.push({
        kind: 'wire',
        p1: geometry.spine.p1,
        p2: geometry.spine.p2,
        selected,
        hovered,
        signal: 'idle',
        bus: true,
        layerOpacity,
        layerId: group.layerId,
      })
      // Los codos no llevan tiradores: si fueran «cables seleccionados» llenarían el bus de
      // cuadraditos. Se les pone el color a mano y se dejan como parte de la línea.
      const stubColor = selected
        ? this.theme.wireSelected
        : hovered
          ? this.theme.hover
          : this.theme.wireBus
      for (const stub of geometry.stubs) {
        items.push({
          kind: 'wire',
          p1: stub.p1,
          p2: stub.p2,
          selected: false,
          hovered: false,
          signal: 'idle',
          bus: false,
          color: stubColor,
          layerOpacity,
          layerId: group.layerId,
        })
      }
    }

    return items
  }

  /**
   * Etiquetas con nombre, rango y valor de cada bus plegado (M3B-03).
   *
   * El valor solo se puede calcular con la corriente puesta. Sin simulación se pasa `null` y
   * la etiqueta muestra `z`, que es el estado por defecto de los cables.
   */
  private busLabelItems(folded: readonly FoldedBus[]): DrawLabel[] {
    const layers = new Map(this.diagram.layersList.map((layer) => [layer.id, layer]))
    const items: DrawLabel[] = []

    for (const { group, geometry } of folded) {
      const bits = group.wireIds.length
      let values: (number | null)[] | null = null
      if (this.simulation.powered) {
        values = []
        for (const id of group.wireIds) {
          const wire = this.diagram.get(id)
          values.push(wire?.kind === 'wire' ? this.simulation.probeValue(wire) : null)
        }
      }

      const layer = layers.get(group.layerId)
      const baseOpacity = layer?.opacity ?? 1
      const dim =
        this.diagram.dimOtherLayers && this.diagram.activeLayerId !== group.layerId ? 0.25 : 1
      const horizontal = geometry.orientation === 'horizontal'
      const middle = {
        x: (geometry.spine.p1.x + geometry.spine.p2.x) / 2,
        y: (geometry.spine.p1.y + geometry.spine.p2.y) / 2,
      }

      items.push({
        kind: 'label',
        position: horizontal
          ? { x: middle.x, y: geometry.spine.p1.y - 0.18 }
          : { x: geometry.spine.p1.x + 0.55, y: middle.y },
        text: busLabelText(group.name, bits, values),
        size: 0.55,
        align: horizontal ? 'center' : 'left',
        baseline: horizontal ? 'bottom' : 'middle',
        selected: group.wireIds.every((id) => this.selected.has(id)),
        layerOpacity: baseOpacity * dim,
      })
    }

    return items
  }

  /** El valor de un cable para la sonda (1/0), o `null` si no se puede saber. */
  probeValue(wire: Wire): number | null {
    return this.simulation.probeValue(wire)
  }

  /** Las señales de las probetas colocadas, para el osciloscopio. */
  get probeChannels(): readonly ProbeChannel[] {
    return this.simulation.probeChannels
  }

  /** Vacía el historial de las probetas sin apagar el circuito. */
  clearProbes(): void {
    this.simulation.clearProbes()
  }

  private savedRevision = 0
  /**
   * Versión del proyecto que se guardó por última vez.
   *
   * El documento solo sabe de cambios en el circuito abierto. Crear o borrar un subcircuito
   * cambia el proyecto entero sin tocar ese documento, así que sin esta marca el aviso de
   * «sin guardar» mentiría y el autoguardado no se enteraría.
   */
  private savedProjectVersion = 0
  get revision(): number {
    return this.diagram.revision
  }
  get dirty(): boolean {
    return (
      this.diagram.revision !== this.savedRevision ||
      this.project.version !== this.savedProjectVersion
    )
  }
  markSaved(): void {
    this.savedRevision = this.diagram.revision
    this.savedProjectVersion = this.project.version
  }

  /** Carga un proyecto completo, reemplazando el actual. */
  loadProject(project: CircuitProject): void {
    this.project = project
    this.circuitPathIds = [MAIN_CIRCUIT_ID]
    this.placeCircuit = null
    this.selected.clear()
    this.savedRevision = this.diagram.revision
    this.savedProjectVersion = project.version
    this.followDiagram()
    this.evaluate()
    this.refresh()
    this.callbacks.onCircuitChange?.(this.circuitPath)
  }

  /**
   * Se pone a escuchar **el diagrama actual**.
   *
   * Al cargar un proyecto o cambiar de circuito, el diagrama es otro objeto; si no se
   * resuscribe, el editor se queda escuchando el viejo y deja de repintar y de simular el
   * que se está viendo. (Ese era un fallo real de M3/M4.)
   */
  private followDiagram(): void {
    this.unsubscribe?.()
    this.unsubscribe = this.diagram.subscribe(() => {
      this.evaluate()
      this.refresh()
      this.callbacks.onDocumentChange?.()
    })
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
        // La caja real del símbolo (giro incluido), no un 2×2 a ojo: una compuerta de alto 4
        // o un símbolo girado se salían del encuadre.
        const box = deviceBounds(el, this.resolveCircuit)
        minX = Math.min(minX, box.x0)
        minY = Math.min(minY, box.y0)
        maxX = Math.max(maxX, box.x1)
        maxY = Math.max(maxY, box.y1)
      }
    }
    const padding = 2
    const worldW = (maxX - minX + padding * 2)
    const worldH = (maxY - minY + padding * 2)
    // Se encuadra en el hueco **útil**: el que queda a la derecha de la paleta. Si se usara
    // el ancho entero, el circuito quedaría centrado debajo de ella y no se vería.
    const availableW = Math.max(120, canvas.clientWidth - this.insets.left - this.insets.right)
    const availableH = Math.max(120, canvas.clientHeight - this.insets.top - this.insets.bottom)
    const zoomX = (availableW - 40) / (worldW * 18)
    const zoomY = (availableH - 40) / (worldH * 18)
    // Nunca más de 100 % al encuadrar: un circuito de cuatro piezas a 300 % ocupa la pantalla
    // entera y da la impresión de que se ha perdido el resto. Acercarse sigue siendo cosa de
    // la rueda.
    this.camera.zoom = Math.min(Math.max(Math.min(zoomX, zoomY), 0.2), Math.min(1, MAX_ZOOM))
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const centerScreenX = this.insets.left + availableW / 2
    const centerScreenY = this.insets.top + availableH / 2
    this.camera.setOffset(
      centerScreenX - centerX * 18 * this.camera.zoom,
      centerScreenY - centerY * 18 * this.camera.zoom,
    )
    this.refresh()
    this.callbacks.onZoom?.(Math.round(this.camera.zoom * 100))
  }

  /** Sintetiza y coloca un circuito a partir de salidas 0/1 (M8B-05). */
  synthesizeCircuit(outputsText: string): void {
    const rawOutputs = outputsText
      .split(/[,\s]+/)
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
    if (rawOutputs.some((v) => v !== 0 && v !== 1)) throw new Error('solo 0/1')
    const outputs: (0 | 1)[] = rawOutputs as (0 | 1)[]
    const inputCount = Math.log2(outputs.length)
    if (!Number.isInteger(inputCount) || inputCount < 1) throw new Error('potencia de 2')
    const fn = booleanFunction(inputCount, outputs, Array.from({ length: inputCount }, (_, i) => `x${i + 1}`))
    const mf = minimize(fn)
    const nl = synthesizeNetlist(fn, mf)
    if (!verifyNetlist(fn, nl).equivalent) throw new Error('verificación fallida')

    // Calcular niveles topológicos
    const levels = new Map<string, number>()
    function levelOf(id: string): number {
      if (levels.has(id)) return levels.get(id) as number
      const node = nl.nodes.find((n) => n.id === id)
      if (!node || node.kind === 'input' || node.kind === 'const') {
        levels.set(id, 0)
        return 0
      }
      const lvl = 1 + Math.max(0, ...node.inputs.map((inp) => levelOf(inp)))
      levels.set(id, lvl)
      return lvl
    }
    for (const node of nl.nodes) levelOf(node.id)

    // Agrupar por nivel
    const byLevel = new Map<number, string[]>()
    for (const node of nl.nodes) {
      const lvl = levels.get(node.id) ?? 0
      if (!byLevel.has(lvl)) byLevel.set(lvl, [])
      byLevel.get(lvl)?.push(node.id)
    }

    const pos = new Map<string, { x: number; y: number }>()
    const idMap = new Map<string, string>()

    // Entradas (in0...)
    for (let i = 0; i < inputCount; i += 1) {
      const nodeId = `in${i}`
      const p = { x: 0, y: i * 6 + 2 }
      pos.set(nodeId, p)
      const btn = this.diagram.addButton(p, { isToggle: true, bitWidth: 1 })
      idMap.set(nodeId, btn.id)
    }

    // Nodos por nivel
    const levelsSorted = [...byLevel.keys()].sort((a, b) => a - b)
    for (const lvl of levelsSorted) {
      if (lvl === 0) continue
      const ids = byLevel.get(lvl) ?? []
      ids.forEach((nid, row) => {
        const node = nl.nodes.find((n) => n.id === nid)
        if (!node) return
        const p = { x: lvl * 8, y: row * 6 + 2 }
        pos.set(nid, p)
        if (node.kind === 'not') {
          const g = this.diagram.addGate('not', p, 1)
          idMap.set(nid, g.id)
        } else if (node.kind === 'and') {
          const g = this.diagram.addGate('and', p, Math.max(1, node.inputs.length))
          idMap.set(nid, g.id)
        } else if (node.kind === 'or') {
          const g = this.diagram.addGate('or', p, Math.max(1, node.inputs.length))
          idMap.set(nid, g.id)
        } else if (node.kind === 'const') {
          const c = this.diagram.addConstant(p, { value: node.value ?? 0 })
          idMap.set(nid, c.id)
        }
      })
    }

    // Cablear usando placedPins
    const resolve = (id: Id) => this.project.circuit(id)
    for (const node of nl.nodes) {
      if (node.kind === 'input' || node.inputs.length === 0) continue
      const targetId = idMap.get(node.id)
      if (!targetId) continue
      const targetEl = this.diagram.get(targetId) as PlacedElement | undefined
      if (!targetEl) continue
      const targetPins = placedPins(targetEl, resolve)
      const targetInputs = targetPins.slice(0, Math.max(1, node.inputs.length))
      node.inputs.forEach((srcId, idx) => {
        const srcElId = idMap.get(srcId)
        if (!srcElId) return
        const srcEl = this.diagram.get(srcElId) as PlacedElement | undefined
        if (!srcEl) return
        const srcPins = placedPins(srcEl, resolve)
        if (srcPins.length === 0) return
        const srcPin = srcPins[srcPins.length - 1]
        if (!srcPin) return
        const dstPin = targetInputs[idx] ?? targetPins[0]
        if (!dstPin) return
        const a = srcPin.point
        const b = dstPin.point
        if (a.x === b.x || a.y === b.y) {
          this.diagram.addWire(a, b, 1)
        } else {
          this.diagram.addWire(a, { x: b.x, y: a.y }, 1)
          this.diagram.addWire({ x: b.x, y: a.y }, b, 1)
        }
      })
    }

    this.fitToContent()
  }

  /** Fija los huecos que tapa la interfaz. No mueve la cámara: solo afecta a los encuadres. */
  setViewportInsets(insets: Partial<ViewInsets>): void {
    this.insets = {
      left: Math.max(0, insets.left ?? this.insets.left),
      top: Math.max(0, insets.top ?? this.insets.top),
      right: Math.max(0, insets.right ?? this.insets.right),
      bottom: Math.max(0, insets.bottom ?? this.insets.bottom),
    }
  }

  /** Vuelve a la vista inicial, dejando el origen a la derecha de la paleta. */
  resetView(): void {
    this.camera.reset(INITIAL_PADDING_X + this.insets.left, INITIAL_PADDING_Y + this.insets.top)
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

  mount(canvas: HTMLCanvasElement, options: { readonly insets?: Partial<ViewInsets> } = {}): void {
    this.unmount()
    this.canvas = canvas
    this.setViewportInsets(options.insets ?? {})

    this.renderer.init(canvas, {
      onStats: (stats) => this.callbacks.onStats?.(stats),
    })

    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKeyDown)

    // El color del lienzo se recalcula solo al cambiar de tema, nunca por fotograma.
    this.stopWatchingTheme = watchTheme(() => {
      this.theme = readTheme()
      this.refresh()
    })

    // Cualquier cambio del documento se recalcula y se repinta en un solo sitio.
    this.followDiagram()

    this.resetView()
    this.evaluate()
    this.refresh()
  }

  /** Exporta el lienzo actual a PNG (M11-08). */
  exportPng(filename = 'circuito.png'): void {
    const canvas = this.canvas
    if (canvas === null) throw new Error('sin lienzo')
    const url = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  /** Exporta el lienzo actual a SVG (M11-09) usando una imagen embebida. */
  exportSvg(filename = 'circuito.svg'): void {
    const canvas = this.canvas
    if (canvas === null) throw new Error('sin lienzo')
    const url = canvas.toDataURL('image/png')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${url}" width="${canvas.width}" height="${canvas.height}"/></svg>`
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(objectUrl)
  }

  unmount(): void {
    const canvas = this.canvas
    if (canvas !== null) {
      canvas.removeEventListener('pointerdown', this.onPointerDown)
      canvas.removeEventListener('pointermove', this.onPointerMove)
      canvas.removeEventListener('pointerup', this.onPointerUp)
      canvas.removeEventListener('pointercancel', this.onPointerUp)
      canvas.removeEventListener('pointerleave', this.onPointerLeave)
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
    // Cambiar de herramienta cancela un cable armado: el siguiente clic debe hacer lo que
    // anuncia la herramienta nueva, no cerrar el cable de antes.
    if (this.wire !== null) {
      this.endWire()
      this.refresh()
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
   * Fija cuántas entradas tendrá **esa** compuerta de la paleta y devuelve el número aceptado.
   *
   * Cada compuerta recuerda el suyo: cambiar la AND no toca la OR. Devuelve el valor recortado
   * para que el selector de la interfaz no se quede enseñando un número que no se va a usar.
   */
  setPaletteInput(pieceId: string, count: number): number {
    const accepted = Math.max(MIN_PIECE_INPUTS, Math.min(MAX_GATE_INPUTS, Math.trunc(count)))
    const safe = Number.isFinite(accepted) ? accepted : MIN_PIECE_INPUTS
    this.paletteInputs.set(pieceId, safe)
    return safe
  }

  /**
   * Cambia el reparto de un repartidor de la paleta y devuelve el reparto efectivo.
   *
   * Se pasa la pieza porque sus valores del catálogo son el punto de partida la primera vez.
   */
  setPaletteSplitter(
    piece: Piece,
    patch: Partial<SplitterSettings>,
  ): SplitterSettings {
    if (piece.kind !== 'splitter') {
      return { pinCount: MIN_PIECE_INPUTS, bitsPerPin: 1, clockwise: true }
    }
    const current = this.paletteSplitters.get(piece.id) ?? splitterDefaults(piece)
    const next = clampSplitterSettings({ ...current, ...patch })
    this.paletteSplitters.set(piece.id, next)
    return next
  }

  /** El subcircuito que se colocará con la herramienta `subcircuit`, si hay uno elegido. */
  get placeCircuitId(): Id | null {
    return this.placeCircuit
  }

  /**
   * Elige qué subcircuito se coloca y activa esa herramienta.
   *
   * Si el circuito no existe —por ejemplo, porque se borró mientras la paleta lo enseñaba—
   * no se cambia nada: es mejor no hacer nada que poner una herramienta que no va a colocar.
   */
  setPlaceCircuit(id: Id): void {
    if (this.project.circuit(id) === undefined) {
      return
    }
    const changed = this.tool !== 'subcircuit'
    this.placeCircuit = id
    if (changed) {
      this.setTool('subcircuit')
    }
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

  setSimulationFrequency(hz: number): void {
    this.simulation.setFrequency(hz)
  }

  pauseSimulation(): void {
    this.simulation.pause()
  }

  resumeSimulation(): void {
    this.simulation.resume()
  }

  toggleSimulationPause(): void {
    if (this.simulation.paused) {
      this.simulation.resume()
    } else {
      this.simulation.pause()
    }
  }

  stepSimulation(): boolean {
    const result = this.simulation.step()
    this.refresh()
    return result
  }

  get simulationPaused(): boolean {
    return this.simulation.paused
  }

  get simulationFrequency(): number {
    return this.simulation.frequencyHz
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

  /**
   * Convierte los cables seleccionados en un bus (M3B-01).
   *
   * El orden de bits lo decide `planBusGroup` por geometría y queda guardado en `wireIds`. Los
   * cables **no** se borran: el bus es una vista plegada de ellos, así que la simulación sigue
   * funcionando igual y desagrupar es instantáneo.
   */
  groupSelection(): boolean {
    if (!this.canGroupSelection) {
      return false
    }
    const wires: Wire[] = []
    for (const id of this.selected) {
      const element = this.diagram.get(id)
      if (element !== undefined && element.kind === 'wire') {
        wires.push(element)
      }
    }
    const result = planBusGroup(wires)
    if (!result.ok) {
      return false
    }
    const group = this.diagram.addBusGroup(result.plan.wireIds, {
      name: result.plan.name,
      collapsed: true,
    })
    if (group === null) {
      return false
    }
    this.callbacks.onSelectionChange?.(this.selectedId)
    this.refresh()
    return true
  }

  /** Deshace el bus seleccionado: sus cables vuelven a verse sueltos. */
  ungroupSelection(): boolean {
    const group = this.selectedBusGroup
    if (group === null || this.simulation.powered) {
      return false
    }
    if (!this.diagram.removeBusGroup(group.id)) {
      return false
    }
    this.callbacks.onSelectionChange?.(this.selectedId)
    this.refresh()
    return true
  }

  /**
   * Pone nombre al bus seleccionado (M3B-03).
   *
   * Se guarda como texto y viaja en el JSON. El nombre vacío es válido: la etiqueta cae al
   * nombre por defecto `Bus n`.
   */
  renameBusGroup(name: string): boolean {
    const group = this.selectedBusGroup
    if (group === null || this.simulation.powered) {
      return false
    }
    if (group.name === name) {
      return true
    }
    if (!this.diagram.updateBusGroup(group.id, { name })) {
      return false
    }
    this.refresh()
    return true
  }

  /**
   * Pliega o despliega un bus (M3B-04).
   *
   * Plegado se dibuja la línea gruesa; desplegado vuelven a verse sus cables de un bit. El
   * grupo no se borra al desplegarlo, así que se puede volver a plegar sin perder el nombre ni
   * el orden de bits. Se prohíbe con la corriente puesta porque el usuario está probando, no
   * editando la vista.
   */
  setBusGroupCollapsed(id: Id, collapsed: boolean): boolean {
    if (this.simulation.powered) {
      return false
    }
    const group = this.diagram.busGroup(id)
    if (group === undefined) {
      return false
    }
    if (group.collapsed === collapsed) {
      return true
    }
    if (!this.diagram.updateBusGroup(id, { collapsed })) {
      return false
    }
    this.refresh()
    return true
  }

  /** Invierte el detalle visual del bus indicado. */
  toggleBusGroupCollapsed(id: Id): boolean {
    const group = this.diagram.busGroup(id)
    return group === undefined ? false : this.setBusGroupCollapsed(id, !group.collapsed)
  }

  /**
   * Valor de cada bit del bus, en orden de bit (M3B-06).
   *
   * Sin simulación no hay verdad que enseñar y todos los bits valen `z`; con corriente se
   * leen los cables reales del grupo. La lista siempre tiene un hueco por bit, aunque falte
   * algún cable, para que el inspector pueda numerarlos sin desplazarse.
   */
  busGroupValues(id: Id): readonly (number | null)[] {
    const group = this.diagram.busGroup(id)
    if (group === undefined) {
      return []
    }
    return group.wireIds.map((wireId) => {
      if (!this.simulation.powered) {
        return null
      }
      const wire = this.diagram.get(wireId)
      return wire?.kind === 'wire' ? this.simulation.probeValue(wire) : null
    })
  }

  /** Mueve lo seleccionado a otra capa, en una sola acción de deshacer. */
  moveSelectionToLayer(layerId: Id): void {
    if (this.selected.size === 0) {
      return
    }
    this.diagram.beginChange()
    try {
      for (const id of this.selected) {
        const element = this.diagram.get(id)
        if (element !== undefined && !this.diagram.isLayerLocked(element.layerId)) {
          this.diagram.moveElementToLayer(id, layerId)
        }
      }
    } finally {
      this.diagram.endChange()
    }
    this.refresh()
  }

  /** Rota la selección 90° en sentido horario (M2-25). */
  rotateSelection(clockwise = true): void {
    if (this.selected.size === 0) return
    this.diagram.beginChange()
    for (const id of [...this.selected]) {
      const device = this.diagram.get(id)
      if (device === undefined || device.kind === 'wire') continue
      if (this.diagram.isLayerLocked(device.layerId)) continue
      const oldPins = placedPins(device, this.resolveCircuit)
      const oldPoints = oldPins.map((p) => p.point)
      // ⚠️ Los cables hay que buscarlos **antes** de girar: en cuanto el símbolo gira, sus
      // pines se mueven y los cables siguen en los viejos, así que preguntar por los pines
      // nuevos no encontraría ninguno. (Ese era el fallo: girar dejaba los cables atrás.)
      const attached = attachedWires(this.diagram.elements, device, this.resolveCircuit)
      this.diagram.rotate(id, clockwise, this.resolveCircuit)
      const newDevice = this.diagram.get(id)
      if (newDevice === undefined || newDevice.kind === 'wire') continue
      const newPins = placedPins(newDevice, this.resolveCircuit)
      // Mover los cables adjuntos: cada extremo que estaba en un pin viejo va al pin nuevo.
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

  updateSelected(patch: Partial<StoredElement>): void {
    if (this.simulation.powered || this.selected.size !== 1) return
    const id = [...this.selected][0]!
    const element = this.diagram.get(id)
    if (element === undefined || this.diagram.isLayerLocked(element.layerId)) return
    this.diagram.updateElement(id, patch)
    this.refresh()
  }

  updateSelection(patch: Partial<StoredElement>): void {
    if (this.simulation.powered || this.selected.size === 0) return
    this.diagram.beginChange()
    for (const id of [...this.selected]) {
      const element = this.diagram.get(id)
      if (element === undefined || this.diagram.isLayerLocked(element.layerId)) continue
      this.diagram.updateElement(id, patch)
    }
    this.diagram.endChange()
    this.refresh()
  }
  setSelectedWireColor(color: string | null): void {
    const wires = [...this.selected]
      .map((id) => this.diagram.get(id))
      .filter(
        (element): element is Wire =>
          element !== undefined &&
          element.kind === 'wire' &&
          !this.diagram.isLayerLocked(element.layerId),
      )
    if (wires.length === 0) {
      return
    }
    this.diagram.setWiresColor(
      wires.map((wire) => wire.id),
      color ?? undefined,
    )
    this.refresh()
  }

  /** Copia la selección al portapapeles en memoria (M2-24). */
  copy(): void {
    const ids = new Set(this.selected)
    const elements = this.diagram.elements.filter(
      (e): e is DrawableDevice => e.kind !== 'wire' && ids.has(e.id),
    )
    const selectedPinPoints = new Set<string>()
    for (const el of elements) {
      for (const placed of placedPins(el, this.resolveCircuit)) {
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
    const clip = this.clipboard
    if (clip === null || clip.elements.length === 0) return
    this.diagram.beginChange()
    const idMap = new Map<Id, Id>()
    for (const el of clip.elements) {
      const position = { x: el.position.x + 1, y: el.position.y + 1 }
      let newId: Id
      switch (el.kind) {
        case 'gate':
          newId = this.diagram.addGate(el.gateType, position, el.inputCount, el.invertedOutput, el.bitWidth).id
          break
        case 'button':
          newId = this.diagram.addButton(position, { isToggle: el.isToggle, inverted: el.inverted, bitWidth: el.bitWidth }).id
          break
        case 'pin':
          newId = this.diagram.addPin(position, {
            pinType: el.pinType,
            side: el.side,
            bitWidth: el.bitWidth,
            inverted: el.inverted,
            name: el.name,
          }).id
          break
        case 'constant':
          newId = this.diagram.addConstant(position, {
            bitWidth: el.bitWidth,
            value: el.value,
            pinSide: el.pinSide,
          }).id
          break
        case 'splitter':
          newId = this.diagram.addSplitter(position, {
            bitWidth: el.bitWidth,
            pinCount: el.pinCount,
            clockwise: el.clockwise,
          }).id
          break
        case 'probe':
          newId = this.diagram.addProbe(position, {
            name: el.name,
            pinSide: el.pinSide,
          }).id
          break
        case 'sensor':
          newId = this.diagram.addSensor(position, {
            sensorType: el.sensorType,
            bitWidth: el.bitWidth,
            pinSide: el.pinSide,
            notation: el.notation,
            data: el.data,
          }).id
          break
        case 'memory':
          newId = this.diagram.addMemory(position, {
            addressBitWidth: el.addressBitWidth,
            dataBitWidth: el.dataBitWidth,
            isRom: el.isRom,
            data: el.data,
          }).id
          break
        case 'sound':
          newId = this.diagram.addSound(position, {
            pinSide: el.pinSide,
            notation: el.notation,
          }).id
          break
        case 'graphicsArray':
          newId = this.diagram.addGraphicsArray(position, {
            bitWidth: el.bitWidth,
            width: el.width,
            height: el.height,
          }).id
          break
        case 'ledMatrix':
          newId = this.diagram.addLedMatrix(position, {
            rows: el.rows,
            columns: el.columns,
          }).id
          break
        case 'circuit':
          newId = this.diagram.addCircuitInstance(position, el.targetCircuitId).id
          break
      }
      idMap.set(el.id, newId)
    }
    for (const w of clip.wires) {
      // Un extremo que colgaba de una pieza copiada se desplaza con ella; uno suelto se queda
      // donde estaba. (Antes el segundo extremo se desplazaba siempre, aunque estuviera suelto.)
      const onCopied = (point: GridPoint): boolean =>
        clip.elements.some((e) =>
          placedPins(e, this.resolveCircuit).some((pp) => pointKey(pp.point) === pointKey(point)),
        )
      const newP1 = onCopied(w.p1) ? { x: w.p1.x + 1, y: w.p1.y + 1 } : w.p1
      const newP2 = onCopied(w.p2) ? { x: w.p2.x + 1, y: w.p2.y + 1 } : w.p2
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
  /**
   * Borra **todo** lo seleccionado.
   *
   * Todos los elementos y sus cables van en **una sola** acción de deshacer: si se borrara
   * uno por uno, cada `Ctrl+Z` devolvería una pieza y haría falta deshacer tantas veces como
   * piezas había. (Antes solo borraba la primera de la selección múltiple.)
   */
  colorSelection(color: string): void {
    this.pendingWireColor = color === '' ? null : color
    if (this.selected.size === 0) {
      this.refresh()
      return
    }
    this.diagram.beginChange()
    for (const id of this.selected) {
      const el = this.diagram.get(id)
      if (el !== undefined && el.kind === 'wire') {
        this.diagram.setWireColor(id, color === '' ? undefined : color)
      }
    }
    this.diagram.endChange()
    this.refresh()
    this.callbacks.onDocumentChange?.()
  }

  removeSelected(): void {
    if (this.selected.size === 0) {
      return
    }
    const ids = [...this.selected]
    this.diagram.beginChange()
    try {
      for (const id of ids) {
        this.removeElement(id)
      }
    } finally {
      this.diagram.endChange()
    }
    this.select(null)
    this.forgetSelectionIfGone()
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
    // Una capa bloqueada no se edita, y borrar es la edición más destructiva.
    if (this.diagram.isLayerLocked(element.layerId)) {
      return
    }

    const attached = element.kind === 'wire'
      ? []
      : attachedWires(this.diagram.elements, element, this.resolveCircuit).filter(
          (wire) => !this.diagram.isLayerLocked(wire.layerId),
        )

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
  loadExample(id: string = 'and'): void {
    this.diagram.beginChange()
    try {
      this.diagram.clear()
      this.simulation.reset()

      if (id === 'or') {
        this.diagram.addButton({ x: 2, y: 2 }, { isToggle: true })
        this.diagram.addButton({ x: 2, y: 4 }, { isToggle: true })
        this.diagram.addGate('or', { x: 8, y: 2 }, 2)
        this.diagram.addGate('led', { x: 14, y: 3 }, 1)
        this.diagram.addWire({ x: 4, y: 3 }, { x: 8, y: 3 })
        this.diagram.addWire({ x: 4, y: 5 }, { x: 8, y: 5 })
        this.diagram.addWire({ x: 11, y: 4 }, { x: 14, y: 4 })
      } else if (id === 'not') {
        this.diagram.addButton({ x: 2, y: 2 }, { isToggle: true })
        this.diagram.addGate('not', { x: 8, y: 1 }, 1, true)
        this.diagram.addGate('led', { x: 14, y: 2 }, 1)
        this.diagram.addWire({ x: 4, y: 3 }, { x: 8, y: 3 })
        this.diagram.addWire({ x: 11, y: 3 }, { x: 14, y: 3 })
      } else if (id === 'xor') {
        this.diagram.addButton({ x: 2, y: 2 }, { isToggle: true })
        this.diagram.addButton({ x: 2, y: 4 }, { isToggle: true })
        this.diagram.addGate('xor', { x: 8, y: 2 }, 2)
        this.diagram.addGate('led', { x: 14, y: 3 }, 1)
        this.diagram.addWire({ x: 4, y: 3 }, { x: 8, y: 3 })
        this.diagram.addWire({ x: 4, y: 5 }, { x: 8, y: 5 })
        this.diagram.addWire({ x: 11, y: 4 }, { x: 14, y: 4 })
      } else if (id === 'clock') {
        this.diagram.addGate('clock', { x: 2, y: 3 }, 0)
        this.diagram.addGate('led', { x: 10, y: 3 }, 1)
        this.diagram.addWire({ x: 4, y: 4 }, { x: 10, y: 4 })
      } else {
        this.diagram.addButton({ x: 2, y: 2 }, { isToggle: true })
        this.diagram.addButton({ x: 2, y: 4 }, { isToggle: true })
        this.diagram.addGate('and', { x: 8, y: 2 }, 2)
        this.diagram.addGate('led', { x: 14, y: 3 }, 1)
        this.diagram.addWire({ x: 4, y: 3 }, { x: 8, y: 3 })
        this.diagram.addWire({ x: 4, y: 5 }, { x: 8, y: 5 })
        this.diagram.addWire({ x: 11, y: 4 }, { x: 14, y: 4 })
      }
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

  /**
   * Avisa de un cambio estructural hecho fuera del editor, como importar un componente.
   *
   * La paleta y el autoguardado escuchan al editor, no al `CircuitProject`. Sin este aviso,
   * los circuitos importados existirían pero no aparecerían como subcircuitos y el cambio
   * no se guardaría hasta la siguiente edición. No navega: el usuario decide si colocarlo.
   */
  projectStructureChanged(): void {
    this.followDiagram()
    this.evaluate()
    this.refresh()
    this.callbacks.onCircuitChange?.(this.circuitPath)
    this.callbacks.onDocumentChange?.()
  }

  /**
   * Cuántas instancias usan un subcircuito en todo el proyecto.
   *
   * Se cuenta en todos los circuitos, no solo en el que se está viendo: borrar una definición
   * que otro nivel usa dejaría una pieza apuntando al vacío. La interfaz lo enseña antes de
   * confirmar el borrado.
   */
  subcircuitUseCount(id: Id): number {
    let count = 0
    for (const circuit of this.project.circuitsList) {
      for (const element of circuit.diagram.storedElements) {
        if (element.kind === 'circuit' && element.targetCircuitId === id) {
          count += 1
        }
      }
    }
    return count
  }

  /**
   * Borra un subcircuito y las instancias que lo usaban.
   *
   * No basta con quitarlo del mapa de circuitos: si queda una instancia, la simulación se
   * encuentra una referencia rota. Las instancias se llevan por delante sus cables, igual que
   * al borrar una pieza a mano. Si el circuito borrado era el que se estaba editando (o un
   * antepasado suyo), la navegación sube al padre antes de borrarlo.
   */
  deleteSubcircuit(id: Id): boolean {
    if (this.simulation.powered || id === MAIN_CIRCUIT_ID) {
      return false
    }
    if (this.project.circuit(id) === undefined) {
      return false
    }

    for (const circuit of this.project.circuitsList) {
      const instances = circuit.diagram.storedElements.filter(
        (element): element is CircuitInstance =>
          element.kind === 'circuit' && element.targetCircuitId === id,
      )
      if (instances.length === 0) {
        continue
      }
      circuit.diagram.beginChange()
      try {
        for (const instance of instances) {
          for (const wire of attachedWires(
            circuit.diagram.storedElements,
            instance,
            this.resolveCircuit,
          )) {
            circuit.diagram.remove(wire.id)
          }
          circuit.diagram.remove(instance.id)
        }
      } finally {
        circuit.diagram.endChange()
      }
    }

    const pathIndex = this.circuitPathIds.indexOf(id)
    if (pathIndex >= 0) {
      const nextPath = pathIndex > 0
        ? this.circuitPathIds.slice(0, pathIndex)
        : [MAIN_CIRCUIT_ID]
      this.circuitPathIds = nextPath.length > 0 ? nextPath : [MAIN_CIRCUIT_ID]
      this.project.openCircuit(this.circuitPathIds[this.circuitPathIds.length - 1] as Id)
    }

    this.project.deleteCircuit(id)
    this.placeCircuit = null
    this.selected.clear()
    this.followDiagram()
    this.evaluate()
    this.refresh()
    this.callbacks.onCircuitChange?.(this.circuitPath)
    this.callbacks.onDocumentChange?.()
    return true
  }

  /** Entra a editar un subcircuito. Devuelve false si no existe. */
  enterSubcircuit(id: Id): boolean {
    if (!this.project.openCircuit(id)) return false
    if (!this.circuitPathIds.includes(id)) {
      this.circuitPathIds = [...this.circuitPathIds, id]
    }
    this.placeCircuit = null
    this.selected.clear()
    this.forgetSelectionIfGone()
    this.callbacks.onCircuitChange?.(this.circuitPathIds)
    this.followDiagram()
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
    this.placeCircuit = null
    this.selected.clear()
    this.forgetSelectionIfGone()
    this.callbacks.onCircuitChange?.(this.circuitPathIds)
    this.followDiagram()
    this.evaluate()
    this.refresh()
    return true
  }

  // ── El ratón ──────────────────────────────────────────────────────────

  /**
   * Captura el puntero para seguir recibiendo el gesto fuera del lienzo.
   *
   * Es una mejora, no un requisito: si el navegador la rechaza (por ejemplo, porque el
   * puntero ya no está activo), el arrastre tiene que seguir funcionando igual. Antes, una
   * excepción aquí abortaba `pointerdown` y dejaba sin respuesta mover, cablear y pulsar
   * interruptores —los tres gestos que empiezan en este punto—, mientras colocar seguía
   * funcionando.
   */
  private capturePointer(canvas: HTMLCanvasElement, pointerId: number): void {
    try {
      canvas.setPointerCapture(pointerId)
    } catch {
      // Sin captura el gesto continúa; solo se pierde el seguimiento fuera del lienzo.
    }
  }

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
    const index = this.sceneIndex()
    const hit = hitTest(index.elements, world, this.resolveCircuit)
    // Un bus plegado no es un cable del modelo: si no hay pin ni símbolo delante, se acierta
    // su línea sintética.
    const bus = hit === null ? this.busGroupAtPoint(world, index.folded) : null
    const additive = event.ctrlKey || event.metaKey

    // Modo ejecución: la corriente está puesta, así que el circuito se está probando y no
    // se edita. Es lo que hace el original (`Editor.InEditMode => !Power`: cada manejador del
    // ratón comprueba que se está en modo edición). Aquí el clic solo pulsa interruptores; el
    // resto del lienzo se sigue pudiendo desplazar, que eso no toca nada.
    //
    // Va **antes** de la comprobación de capa bloqueada: bloquear una capa protege el
    // documento, no impide probarlo. Antes, una capa bloqueada dejaba también sin respuesta a
    // los interruptores y parecía que el circuito no funcionaba.
    if (this.simulation.powered) {
      // Un pin cuenta como su símbolo: si se acierta el pin de un interruptor, se pulsa.
      const element = hit === null || hit.kind === 'wire' ? null : hit.element
      this.capturePointer(canvas, event.pointerId)

      if (element !== null && element.kind === 'button') {
        this.pressButton(element)
        this.refresh()
      } else {
        this.pan = { lastX: event.clientX, lastY: event.clientY }
      }
      return
    }

    // Capa bloqueada: no se edita.
    if (hit !== null && hit.kind !== 'wire' && this.diagram.isLayerLocked(hit.element.layerId ?? DEFAULT_LAYER_ID)) {
      return
    }
    if (hit !== null && hit.kind === 'wire' && this.diagram.isLayerLocked(hit.element.layerId)) {
      return
    }
    if (bus !== null && this.diagram.isLayerLocked(bus.layerId)) {
      return
    }

    // El borrador: un clic se lleva lo que toque. Sobre el vacío no hay nada que borrar, así
    // que ahí el arrastre sigue moviendo la vista (y el clic, quitando la selección).
    if (this.tool === 'erase') {
      if (bus !== null) {
        // Borrar la línea de un bus se lleva sus cables: es lo que el usuario ve desaparecer.
        this.diagram.beginChange()
        try {
          for (const id of [...bus.wireIds]) {
            this.removeElement(id)
          }
        } finally {
          this.diagram.endChange()
        }
        this.forgetSelectionIfGone()
        this.refresh()
        return
      }
      if (hit !== null) {
        this.removeElement(hit.element.id)
        this.forgetSelectionIfGone()
        this.refresh()
        return
      }
      this.capturePointer(canvas, event.pointerId)
      this.select(null)
      this.pan = { lastX: event.clientX, lastY: event.clientY }
      this.refresh()
      return
    }

    // Un cable ya armado (primer clic en un pin) se cierra con el siguiente clic, caiga donde
    // caiga. Se hace **antes** de colocar: mientras se cablea, la herramienta de colocación
    // no debe poner una pieza nueva encima.
    if (this.wire !== null) {
      const end = this.endAt(event)
      this.finishWire(end)
      return
    }

    // Ctrl/Cmd + clic añade o quita de la selección. Va antes de mover y de cablear para que
    // el gesto sea siempre «seleccionar varios», nunca un arrastre involuntario.
    if (this.tool === 'select' && additive) {
      if (bus !== null) {
        this.toggleBusSelection(bus)
        return
      }
      if (hit !== null) {
        this.toggleSelected(hit.element.id)
        return
      }
    }

    // Con una herramienta de colocación, el clic coloca… salvo que caiga sobre un símbolo,
    // y entonces se interactúa con él. Si no, la herramienta se queda pegada y pulsar un
    // interruptor recién puesto no haría nada, que es justo lo que pasaba.
    if (this.tool !== 'select' && this.tool !== 'wire' && (hit === null || (hit.kind !== 'device' && hit.kind !== 'pin'))) {
      this.place(this.tool, grid)
      return
    }

    // Modo cableado: no se mueven piezas. Solo se cablea y se seleccionan cables para colorear.
    if (this.tool === 'wire' && hit !== null && hit.kind === 'device') {
      this.select(hit.element.id)
      this.refresh()
      return
    }
    if (this.tool === 'wire' && bus !== null) {
      this.selectMany(bus.wireIds)
      return
    }

    this.capturePointer(canvas, event.pointerId)

    if (hit !== null && hit.kind === 'pin') {
      this.startWire(hit.point, world)
      this.wirePress = { x: event.clientX, y: event.clientY, moved: false }
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
        if (el !== undefined && el.kind !== 'wire' && !this.diagram.isLayerLocked(el.layerId)) {
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
      if (this.pendingWireColor !== null) {
        this.diagram.setWireColor(hit.element.id, this.pendingWireColor)
      }
      this.refresh()
      return
    }

    if (bus !== null) {
      this.selectMany(bus.wireIds)
      return
    }

    // Selección por área (M2-19): Shift + arrastrar.
    if (event.shiftKey) {
      this.capturePointer(canvas, event.pointerId)
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
      const press = this.wirePress
      if (press !== null && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 3) {
        press.moved = true
      }
      this.cursor = this.worldAt(event)
      this.refresh()
      return
    }

    const drag = this.drag
    if (drag === null) {
      // Al pasar por encima de un pin, el cursor deja de ser la mano: ahí se cablea,
      // no se mueve. Así se distingue el gesto antes de apretar.
      const world = this.worldAt(event)
      const index = this.sceneIndex()
      const hit = hitTest(index.elements, world, this.resolveCircuit)
      const bus = hit === null ? this.busGroupAtPoint(world, index.folded) : null
      // Resalte de hover (M6-06): solo se repinta cuando cambia, no en cada movimiento.
      const hovered = hit?.element.id ?? bus?.id ?? null
      if (this.hovered !== hovered) {
        this.hovered = hovered
        this.refresh()
      }
      if (this.canvas !== null) {
        if (this.simulation.powered) {
          // Con corriente solo se pulsa: la mano sobre un interruptor lo anuncia.
          const pressable = hit !== null && hit.kind !== 'wire' && hit.element.kind === 'button'
          this.canvas.style.cursor = pressable ? 'pointer' : ''
        } else if (this.tool !== 'select') {
          // Con una herramienta puesta, el cursor es la cruz incluso sobre un pin.
          this.canvas.style.cursor = ''
        } else if (hit?.kind === 'pin') {
          // Sobre un pin se cablea: la cruz lo dice antes de apretar.
          this.canvas.style.cursor = 'crosshair'
        } else if (hit?.kind === 'device') {
          // Sobre una pieza se arrastra: la flecha de mover lo dice, en vez de la mano de
          // desplazar la vista. Antes las dos eran `grab` y no se sabía qué iba a pasar.
          this.canvas.style.cursor = 'move'
        } else if (bus !== null) {
          this.canvas.style.cursor = 'pointer'
        } else {
          this.canvas.style.cursor = ''
        }
      }
      // Sonda: solo sobre cables, para no costar nada cuando no aplica.
      if (hit?.kind === 'wire') {
        const w = hit.element
        const value = this.probeValue(w) ?? 0
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
          const attached = event.shiftKey
            ? []
            : attachedWires(this.diagram.elements, el, this.resolveCircuit)
          const pins = new Set(
            placedPins(el, this.resolveCircuit).map((placed) => pointKey(placed.point)),
          )
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
        const attached = event.shiftKey
          ? []
          : attachedWires(this.diagram.elements, device, this.resolveCircuit)
        const pins = new Set(
          placedPins(device, this.resolveCircuit).map((placed) => pointKey(placed.point)),
        )
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

  /** Al salir del lienzo se apaga el resalte y la sonda (M6-06). */
  private readonly onPointerLeave = (): void => {
    this.callbacks.onHoverChange?.(null, null, 1, 0, 0)
    if (this.hovered === null) {
      return
    }
    this.hovered = null
    this.refresh()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const canvas = this.canvas
    try {
      if (canvas !== null && canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
    } catch {
      // La captura pudo fallar al empezar: no hay nada que soltar.
    }

    this.finishButtonPress()
    this.pan = null

    if (this.wire !== null) {
      if (this.wirePress?.moved === true) {
        // Fue un arrastre: soltar tiende el cable, como siempre.
        this.finishWire(this.endAt(event))
      } else {
        // Fue un clic seco: el cable se queda armado y se cierra con el siguiente clic. Así
        // se puede cablear tanto arrastrando como haciendo clic en un pin y luego en el otro.
        this.wirePress = null
        this.cursor = this.worldAt(event)
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
      const inside = (point: GridPoint): boolean =>
        point.x >= x0 && point.x <= x1 && point.y >= y0 && point.y <= y1
      const index = this.sceneIndex()
      for (const element of index.elements) {
        if (this.diagram.isLayerLocked(element.layerId)) continue
        if (element.kind === 'wire') {
          const middle = {
            x: (element.p1.x + element.p2.x) / 2,
            y: (element.p1.y + element.p2.y) / 2,
          }
          if (inside(element.p1) || inside(element.p2) || inside(middle)) {
            this.selected.add(element.id)
          }
          continue
        }
        const p = element.position
        if (inside(p)) {
          this.selected.add(element.id)
        }
      }
      // Un bus plegado se selecciona entero si su línea cae dentro del área, aunque sus cables
      // individuales estén ocultos.
      for (const { group, geometry } of index.folded) {
        const middle = {
          x: (geometry.spine.p1.x + geometry.spine.p2.x) / 2,
          y: (geometry.spine.p1.y + geometry.spine.p2.y) / 2,
        }
        if (inside(geometry.spine.p1) || inside(geometry.spine.p2) || inside(middle)) {
          for (const id of group.wireIds) {
            this.selected.add(id)
          }
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
   * La pieza del catálogo con los ajustes que se hayan elegido en la paleta.
   *
   * Se devuelve una copia para no mutar el catálogo: el original sigue siendo la plantilla de
   * la próxima colocación.
   */
  private configuredPiece(piece: Piece): Piece {
    if (piece.kind === 'gate' && piece.inputCount === 'variable') {
      return { ...piece, inputCount: this.paletteInputs.get(piece.id) ?? this.inputs }
    }
    if (piece.kind === 'splitter') {
      const settings = this.paletteSplitters.get(piece.id) ?? splitterDefaults(piece)
      return {
        ...piece,
        pinCount: settings.pinCount,
        bitWidth: settings.pinCount * settings.bitsPerPin,
        clockwise: settings.clockwise,
      }
    }
    return piece
  }

  /**
   * Coloca la pieza de la herramienta activa, centrada en la celda donde se hizo clic.
   *
   * El hueco se mide con el modelo (`pieceLayout`), no a ojo: si el dibujo y el hueco libre se
   * calcularan por separado, cualquier día no coincidirían y se apilarían símbolos.
   */
  private place(tool: Tool, grid: GridPoint): void {
    if (this.diagram.isLayerLocked(this.diagram.activeLayerId)) {
      return
    }

    let size: { readonly width: number; readonly height: number }
    let piece: ReturnType<typeof findPiece> | null = null
    let target: Circuit | null = null

    if (tool === 'subcircuit') {
      target =
        this.placeCircuit === null ? null : this.project.circuit(this.placeCircuit) ?? null
      if (target === null) {
        // La paleta podía tener una instancia elegida que ya no existe. No se coloca nada.
        return
      }
      size = circuitInstanceLayout(target)
    } else {
      if (tool === 'select' || tool === 'erase' || tool === 'wire') {
        return
      }
      piece = this.configuredPiece(findPiece(tool))
      size = pieceLayout(piece, this.placeInputs)
    }

    const position: GridPoint = {
      x: grid.x - Math.floor(size.width / 2),
      y: grid.y - Math.floor(size.height / 2),
    }

    if (this.isOccupied(position, size)) {
      // Ya hay algo ahí: no se apilan símbolos.
      return
    }

    if (target !== null) {
      this.diagram.addCircuitInstance(position, target.id)
    } else if (piece !== null) {
      placePiece(this.diagram, piece, position, this.placeInputs)
    }
  }

  /** ¿Hay ya algún símbolo en alguna de las celdas que ocuparía el nuevo? */
  private isOccupied(position: GridPoint, size: { width: number; height: number }): boolean {
    for (let y = 0; y < size.height; y += 1) {
      for (let x = 0; x < size.width; x += 1) {
        if (
          this.diagram.deviceAt(
            { x: position.x + x, y: position.y + y },
            undefined,
            this.resolveCircuit,
          ) !== undefined
        ) {
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
    this.wirePress = null
    this.cursor = null
    this.emitWiring(false)
  }

  /** Cierra el cable que estaba armado o en curso en el punto dado. */
  private finishWire(end: GridPoint | null): void {
    const from = this.wire?.from
    this.endWire()
    if (from === undefined || end === null || (end.x === from.x && end.y === from.y)) {
      this.refresh()
      return
    }
    this.diagram.addWire(from, end)
    if (this.pendingWireColor !== null) {
      // El último cable creado recibe el color pendiente (modo cableado).
      const wires = [...this.diagram.elements].filter((e) => e.kind === 'wire')
      const last = wires[wires.length - 1]
      if (last !== undefined) {
        this.diagram.setWireColor(last.id, this.pendingWireColor)
      }
    }
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

  /**
   * Deja seleccionados varios elementos de golpe (selección por capa).
   *
   * El aviso de selección lleva el primero: los paneles solo necesitan saber si hay algo
   * seleccionado y enseñar una propiedad representativa, como hacían ya con la selección por
   * área.
   */
  selectMany(ids: readonly Id[]): void {
    this.selected.clear()
    for (const id of ids) {
      if (this.diagram.get(id) !== undefined) {
        this.selected.add(id)
      }
    }
    this.callbacks.onSelectionChange?.(this.selectedId)
    this.refresh()
  }

  /** Selecciona todo lo que hay en una capa (M5). */
  selectAllInLayer(layerId: Id): void {
    this.selectMany(this.diagram.selectAllInLayer(layerId))
  }

  /**
   * Añade o quita un elemento de la selección (Ctrl/Cmd + clic).
   *
   * Se usa un modificador distinto de `Shift` porque `Shift` ya está ocupado por la selección
   * por área y por soltar los cables de una pieza al moverla.
   */
  toggleSelected(id: Id): void {
    if (this.diagram.get(id) === undefined) {
      return
    }
    if (!this.selected.delete(id)) {
      this.selected.add(id)
    }
    this.callbacks.onSelectionChange?.(this.selectedId)
    this.refresh()
  }

  /** Añade o quita un bus completo de la selección. */
  private toggleBusSelection(group: BusGroup): void {
    const allSelected = group.wireIds.every((id) => this.selected.has(id))
    for (const id of group.wireIds) {
      if (allSelected) {
        this.selected.delete(id)
      } else {
        this.selected.add(id)
      }
    }
    this.callbacks.onSelectionChange?.(this.selectedId)
    this.refresh()
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
    if (cursor === null || this.wire === null) {
      return null
    }
    return this.endAtWorld(cursor)
  }

  /** El punto de destino de un clic, sin depender de por dónde haya pasado el ratón. */
  private endAt(event: PointerEvent): GridPoint {
    return this.endAtWorld(this.worldAt(event))
  }

  /**
   * El punto donde cae un extremo de cable.
   *
   * Sobre un pin se usa **el punto exacto del pin**, que es lo que hace la conexión; fuera de
   * él se redondea a la rejilla (o se deja tal cual si el imán está apagado). Los cables no
   * se tocan por su interior en este modelo, así que acertar un cable no basta para unirse a
   * él: hay que caer en uno de sus extremos.
   */
  private endAtWorld(point: GridPoint): GridPoint {
    const hit = hitTest(this.diagram.visibleElements, point, this.resolveCircuit)
    if (hit !== null && hit.kind === 'pin') {
      return hit.point
    }
    return this.snapToGrid ? { x: Math.round(point.x), y: Math.round(point.y) } : { x: point.x, y: point.y }
  }

  private worldAt(event: PointerEvent): GridPoint {
    const canvas = this.canvas
    if (canvas === null) {
      return { x: 0, y: 0 }
    }
    const rect = canvas.getBoundingClientRect()
    return this.camera.toWorld(event.clientX - rect.left, event.clientY - rect.top)
  }

  worldAtClient(clientX: number, clientY: number): GridPoint {
    const canvas = this.canvas
    if (canvas === null) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return this.camera.toWorld(clientX - rect.left, clientY - rect.top)
  }

  toScreen(world: GridPoint): { x: number; y: number } {
    const canvas = this.canvas
    const rect = canvas?.getBoundingClientRect()
    const point = this.camera.toScreen(world)
    return { x: point.x + (rect?.left ?? 0), y: point.y + (rect?.top ?? 0) }
  }

  private gridAt(event: PointerEvent): GridPoint {
    const canvas = this.canvas
    if (canvas === null) {
      return { x: 0, y: 0 }
    }
    const rect = canvas.getBoundingClientRect()
    const raw = this.camera.toWorld(event.clientX - rect.left, event.clientY - rect.top)
    // Con el imán puesto se redondea a la intersección; sin él, la pieza queda donde se suelta.
    return this.snapToGrid ? { x: Math.round(raw.x), y: Math.round(raw.y) } : raw
  }

  /** Aplica la preferencia de rejilla visible. */
  setShowGrid(visible: boolean): void {
    if (visible === this.showGrid) {
      return
    }
    this.showGrid = visible
    this.refresh()
  }

  /** Aplica la preferencia de imán a la rejilla. */
  setSnapToGrid(snap: boolean): void {
    this.snapToGrid = snap
  }

  private evaluate(): void {
    // La simulación ve **todos** los elementos guardados, no solo los de la capa visible:
    // ocultar una capa es cosa de la vista, no del circuito.
    this.sim = this.simulation.evaluate(this.diagram.storedElements)
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
    const visible = this.diagram.visibleElements
    const index = this.sceneIndex(visible)
    const counts = connectionCounts(visible, this.resolveCircuit)
    // Los buses plegados tapan sus cables y ocupan su sitio con una línea sintética.
    const hiddenWires = index.hidden

    for (const device of this.diagram.devices) {
      for (const placed of placedPins(device, this.resolveCircuit)) {
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
        sketch.push({ kind: 'wire', p1: this.wire.from, p2: end, selected: false, signal: 'idle', bus: false })
      }
    }

    // El color de cada cable depende de su señal (M6-03). Solo tiene sentido con la corriente
    // puesta: apagado, un cable no lleva nada y va en reposo. Los buses no se sondean bit a
    // bit: se pintan con su propio color por el grosor (M6-15).
    const paintMode = loadSettings().paintWiresOnPower
    const wireStates = new Map<Id, WireSignal>()
    if (this.simulation.powered && paintMode !== 'never') {
      for (const element of visible) {
        if (element.kind === 'wire' && element.bitWidth === 1 && !hiddenWires.has(element.id)) {
          const value = this.simulation.probeValue(element)
          wireStates.set(element.id, value === null ? 'floating' : value === 0 ? 'low' : 'high')
        }
      }
    }

    this.renderer.render(
      buildScene({
        elements: index.elements,
        buses: this.busDrawItems(index.folded),
        states: this.sim.devices,
        segmentStates: this.sim.segmentStates,
        wireStates,
        selected: this.selected,
        hovered: this.hovered,
        camera: this.camera.state,
        theme: this.theme,
        showGrid: this.showGrid,
        layers: new Map(this.diagram.layersList.map((l) => [l.id, { color: l.color, opacity: l.opacity }])),
        dimOtherLayers: this.diagram.dimOtherLayers,
        activeLayerId: this.diagram.activeLayerId,
        paintWiresOnPower: paintMode,
        resolveCircuit: this.resolveCircuit,
        pinDots,
        sketch,
        labels: this.busLabelItems(index.folded),
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
        const grid = GRID_SIZE
        const dpr = window.devicePixelRatio || 1
        const px0 = (this.camera.state.offsetX + x0 * grid * zoom) * dpr
        const py0 = (this.camera.state.offsetY + y0 * grid * zoom) * dpr
        const pw = (x1 - x0 + 1) * grid * zoom * dpr
        const ph = (y1 - y0 + 1) * grid * zoom * dpr
        ctx.save()
        ctx.strokeStyle = withAlpha(this.theme.selection, 0.9)
        ctx.fillStyle = withAlpha(this.theme.selection, 0.15)
        ctx.lineWidth = 1
        ctx.fillRect(px0, py0, pw, ph)
        ctx.strokeRect(px0, py0, pw, ph)
        ctx.restore()
      }
    }

    this.callbacks.onZoom?.(Math.round(this.camera.zoom * 100))
    this.emitHistory()

    for (const listener of this.viewListeners) {
      listener()
    }
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
  w: 'wire',
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
function attachedWires(
  elements: readonly StoredElement[],
  device: PlacedElement,
  resolveCircuit?: (id: Id) => Circuit | undefined,
): Wire[] {
  const pins = new Set(placedPins(device, resolveCircuit).map((placed) => pointKey(placed.point)))
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
