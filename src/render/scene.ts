/**
 * Modelo → piezas de dibujo.
 *
 * Éste es el único sitio que sabe las dos cosas: qué es un elemento del circuito y qué
 * espera el renderizador. El renderizador, gracias a esto, sigue sin conocer el modelo, y
 * la aplicación no tiene que saber cómo se dibuja nada.
 *
 * Se llama **cuando algo cambia**, no en cada fotograma: el renderizador se queda con la
 * escena y la repinta cuando hace falta.
 */

import { deviceLayout, type CircuitResolver } from '../core/model/layout'
import { junctionPoints } from '../core/simulate/nets'
import type { Constant, DeviceState, DrawableDevice, Element, Id } from '../core/model/types'
import type { CameraState } from './camera'
import type {
  DrawDevice,
  DrawItem,
  DrawLabel,
  DrawPinDot,
  DrawWire,
  RenderLayer,
  RenderScene,
  RenderTheme,
  WireSignal,
} from './ir-renderer'
import { shapeForGate, type SymbolShape } from './symbols'

export interface SceneOptions {
  readonly elements: readonly Element[]
  /** Estado de cada dispositivo. Lo que no esté, se pinta apagado. */
  readonly states: ReadonlyMap<Id, DeviceState>
  /**
   * Estado de cada segmento de los displays de 7 segmentos, por dispositivo.
   * Lo que no esté se pinta apagado.
   */
  readonly segmentStates?: ReadonlyMap<Id, readonly DeviceState[]>
  /** Estado eléctrico de cada cable (M6-03). Lo que no esté, se pinta en reposo. */
  readonly wireStates?: ReadonlyMap<Id, WireSignal>
  /** Cómo se pintan los cables al encender (preferencia del usuario). */
  readonly paintWiresOnPower?: 'always' | 'never' | 'defaults'
  readonly selected: ReadonlySet<Id>
  /** Elemento bajo el cursor, para resaltarlo (M6-06). */
  readonly hovered?: Id | null
  readonly camera: CameraState
  readonly theme: RenderTheme
  readonly showGrid: boolean
  /**
   * Capas del circuito, para aplicar su color y opacidad (M5).
   */
  readonly layers?: ReadonlyMap<Id, { readonly color: string; readonly opacity: number }>
  /** Si es true, las capas que no son la activa se atenúan (M5). */
  readonly dimOtherLayers?: boolean
  /** Id de la capa activa (para saber cuál no se atenúa). */
  readonly activeLayerId?: Id
  /**
   * Cómo encontrar el circuito que representa una instancia. Sin esto, un subcircuito se
   * mide como una caja vacía 2×2 y se pinta sin sus pines.
   */
  readonly resolveCircuit?: CircuitResolver
  /** Puntitos de pin que hay que destacar (mientras se cablea). */
  readonly pinDots?: readonly DrawPinDot[]
  /**
   * Tramos sintéticos de los buses plegados (M3B-01).
   *
   * No salen de un `Wire`: el editor ya calculó la línea y los codos. Se pintan con los cables,
   * antes de los símbolos, para que una pieza siempre tape el bus que le entra por debajo.
   */
  readonly buses?: readonly DrawWire[]
  /** Cables que se están dibujando ahora mismo. Van los últimos, encima de todo. */
  readonly sketch?: readonly DrawWire[]
  /** Etiquetas libres. Se pintan encima de todo (M3B-03). */
  readonly labels?: readonly DrawLabel[]
}

export function buildScene(options: SceneOptions): RenderScene {
  // El orden de capas sale del mapa de ajustes (que el editor construye en z-order) y, si
  // falta alguna, del orden en que aparece en los elementos. Así una capa vacía no rompe
  // el orden y una capa con solo buses tampoco se queda fuera.
  const layerIds: Id[] = []
  const known = new Set<Id>()
  const addLayer = (id: Id): void => {
    if (known.has(id)) return
    known.add(id)
    layerIds.push(id)
  }
  for (const id of options.layers?.keys() ?? []) {
    addLayer(id)
  }
  for (const element of options.elements) {
    addLayer(element.layerId)
  }

  const elementsByLayer = new Map<Id, Element[]>()
  for (const element of options.elements) {
    const group = elementsByLayer.get(element.layerId)
    if (group === undefined) {
      elementsByLayer.set(element.layerId, [element])
    } else {
      group.push(element)
    }
  }

  const busesByLayer = new Map<Id, DrawWire[]>()
  for (const bus of options.buses ?? []) {
    const layerId = bus.layerId ?? layerIds[0]
    if (layerId === undefined) continue
    addLayer(layerId)
    const group = busesByLayer.get(layerId)
    if (group === undefined) {
      busesByLayer.set(layerId, [bus])
    } else {
      group.push(bus)
    }
  }

  const layers: RenderLayer[] = []
  const items: DrawItem[] = []

  for (const layerId of layerIds) {
    const layerElements = elementsByLayer.get(layerId) ?? []
    const layerItems: DrawItem[] = []
    const layer = options.layers?.get(layerId)

    // El punto de unión va el primero de todos: en el original está en `Z = 0`, por debajo
    // incluso de los cables, porque es el remache que los une y no una pieza que va encima.
    // Se calcula por capa: un cruce entre cables de capas distintas no es una unión visual.
    for (const point of junctionPoints(layerElements)) {
      layerItems.push({ kind: 'junction', point })
    }

    // Después los cables y luego los símbolos: en el original el cable tiene Z = 1, así
    // que un símbolo siempre tapa el cable que le entra por debajo.
    for (const element of layerElements) {
      if (element.kind !== 'wire') {
        continue
      }
      const paint = options.paintWiresOnPower ?? 'defaults'
      // «Siempre» borra el color forzado a mano para que el estado mande; «defaults» lo
      // respeta; «nunca» se resuelve no pasando `wireStates` (se pinta en reposo).
      const color = paint === 'always' ? undefined : element.color
      const baseOpacity = layer?.opacity ?? 1
      const dim =
        options.dimOtherLayers === true &&
        options.activeLayerId !== undefined &&
        element.layerId !== options.activeLayerId
          ? 0.25
          : 1
      layerItems.push({
        kind: 'wire',
        p1: element.p1,
        p2: element.p2,
        selected: options.selected.has(element.id),
        hovered: options.hovered === element.id,
        signal: options.wireStates?.get(element.id) ?? 'idle',
        bus: element.bitWidth > 1,
        color,
        layerOpacity: baseOpacity * dim,
      })
    }

    // Los buses plegados se pintan en el mismo plano que los cables: debajo de los símbolos.
    for (const bus of busesByLayer.get(layerId) ?? []) {
      layerItems.push({ ...bus, kind: 'wire' })
    }

    for (const element of layerElements) {
      if (element.kind === 'wire') {
        continue
      }

      const shape = shapeForDevice(element)
      if (shape === null) {
        // Compuerta que todavía no sabemos dibujar. Se ignora en vez de reventar: así
        // cargar un circuito con compuertas de M2 no rompe nada.
        continue
      }

      const layout = deviceLayout(element, options.resolveCircuit)
      const label = labelFor(element, options.resolveCircuit)
      const baseOpacity = layer?.opacity ?? 1
      const dim =
        options.dimOtherLayers === true &&
        options.activeLayerId !== undefined &&
        element.layerId !== options.activeLayerId
          ? 0.25
          : 1
      const segmentStates = options.segmentStates?.get(element.id)
      const device: DrawDevice = {
        kind: 'device',
        shape,
        position: element.position,
        rotation: element.rotation,
        width: layout.width,
        height: layout.height,
        selected: options.selected.has(element.id),
        hovered: options.hovered === element.id,
        state: options.states.get(element.id) ?? 'off',
        layerOpacity: baseOpacity * dim,
        ...(label === undefined ? {} : { label }),
        ...(segmentStates === undefined ? {} : { segmentStates }),
      }
      layerItems.push(device)
    }

    if (layerItems.length === 0) {
      continue
    }
    layers.push({ id: layerId, items: layerItems })
    items.push(...layerItems)
  }

  const overlays: DrawItem[] = []
  if (options.pinDots !== undefined) {
    overlays.push(...options.pinDots)
  }
  if (options.sketch !== undefined) {
    for (const wire of options.sketch) {
      overlays.push({ ...wire, overlay: true })
    }
  }
  if (options.labels !== undefined) {
    overlays.push(...options.labels)
  }
  items.push(...overlays)

  return {
    camera: options.camera,
    theme: options.theme,
    showGrid: options.showGrid,
    layers,
    overlays,
    items,
  }
}

/**
 * La silueta de un símbolo, según lo que sea.
 *
 * Las compuertas pueden no tener silueta todavía (`shapeForGate` devuelve `null` para los
 * tipos que el motor no sabe negar); el resto siempre la tiene.
 */
function shapeForDevice(element: DrawableDevice): SymbolShape | null {
  switch (element.kind) {
    case 'gate':
      if (element.gateType === 'led' && element.inputCount === 8) {
        return 'sevenSegment'
      }
      return shapeForGate(element.gateType, element.invertedOutput)
    case 'button':
      return 'button'
    case 'pin':
      // La punta de un pin de entrada asoma por la derecha; la de uno de salida, por la
      // izquierda (ver `pinLayout`). El cheurón de la silueta apunta hacia la punta.
      return element.pinType === 'output' ? 'pinOutput' : 'pinInput'
    case 'constant':
      return 'constant'
    case 'probe':
      return 'probe'
    case 'sensor':
      return 'sensor'
    case 'memory':
      return 'memory'
    case 'sound':
      return 'sound'
    case 'graphicsArray':
      return 'graphicsArray'
    case 'ledMatrix':
      return 'ledMatrix'
    case 'splitter':
      return 'splitter'
    case 'circuit':
      return 'circuit'
  }
}

/**
 * El texto que va dentro del símbolo, si lo lleva.
 *
 * Los pines y las constantes muestran su nombre o su valor; los subcircuitos, el nombre de
 * la hoja que representan. Las compuertas e interruptores no llevan etiqueta: su forma ya
 * lo dice todo y el original tampoco les pinta texto.
 */
function labelFor(element: DrawableDevice, resolveCircuit?: CircuitResolver): string | undefined {
  switch (element.kind) {
    case 'pin': {
      const name = element.name.trim()
      return name === '' ? undefined : name
    }
    case 'constant':
      return constantLabel(element)
    case 'probe': {
      const name = element.name.trim()
      return name === '' || name === element.id ? undefined : name
    }
    case 'sensor': {
      // El original enseña la notación bajo el valor; si no hay, el tipo es lo único que
      // distingue dos sensores en el lienzo.
      const notation = element.notation.trim()
      return notation === '' ? element.sensorType : notation
    }
    case 'memory':
      return element.isRom ? 'ROM' : 'RAM'
    case 'circuit':
      return resolveCircuit?.(element.targetCircuitId)?.name
    default:
      return undefined
  }
}

/** El valor de una constante como texto corto: decimal si cabe, hexadecimal si no. */
function constantLabel(constant: Constant): string {
  const bits = Math.max(1, Math.min(32, constant.bitWidth))
  const mask = bits === 32 ? 0xffffffff : 2 ** bits - 1
  // `&` trabaja con enteros de 32 bits con signo; `>>> 0` lo devuelve a sin signo para que
  // una constante de 32 bits con el bit alto puesto no se pinte como un número negativo.
  const value = (constant.value & mask) >>> 0
  return bits <= 4 ? String(value) : `0x${value.toString(16).toUpperCase()}`
}
