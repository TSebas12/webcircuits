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
  DrawPinDot,
  DrawWire,
  RenderScene,
  RenderTheme,
  WireSignal,
} from './ir-renderer'
import { shapeForGate, type SymbolShape } from './symbols'

export interface SceneOptions {
  readonly elements: readonly Element[]
  /** Estado de cada dispositivo. Lo que no esté, se pinta apagado. */
  readonly states: ReadonlyMap<Id, DeviceState>
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
   * Cómo encontrar el circuito que representa una instancia. Sin esto, un subcircuito se
   * mide como una caja vacía 2×2 y se pinta sin sus pines.
   */
  readonly resolveCircuit?: CircuitResolver
  /** Puntitos de pin que hay que destacar (mientras se cablea). */
  readonly pinDots?: readonly DrawPinDot[]
  /** Cables que se están dibujando ahora mismo. Van los últimos, encima de todo. */
  readonly sketch?: readonly DrawWire[]
}

export function buildScene(options: SceneOptions): RenderScene {
  const items: DrawItem[] = []

  // El punto de unión va el primero de todos: en el original está en `Z = 0`, por debajo
  // incluso de los cables, porque es el remache que los une y no una pieza que va encima.
  for (const point of junctionPoints(options.elements)) {
    items.push({ kind: 'junction', point })
  }

  // Después los cables y luego los símbolos: en el original el cable tiene Z = 1, así
  // que un símbolo siempre tapa el cable que le entra por debajo.
  for (const element of options.elements) {
    if (element.kind === 'wire') {
      const paint = options.paintWiresOnPower ?? 'defaults'
      // «Siempre» borra el color forzado a mano para que el estado mande; «defaults» lo
      // respeta; «nunca» se resuelve no pasando `wireStates` (se pinta en reposo).
      const color = paint === 'always' ? undefined : element.color
      items.push({
        kind: 'wire',
        p1: element.p1,
        p2: element.p2,
        selected: options.selected.has(element.id),
        hovered: options.hovered === element.id,
        signal: options.wireStates?.get(element.id) ?? 'idle',
        bus: element.bitWidth > 1,
        color,
      })
    }
  }

  for (const element of options.elements) {
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
      ...(label === undefined ? {} : { label }),
    }
    items.push(device)
  }

  if (options.pinDots !== undefined) {
    items.push(...options.pinDots)
  }
  if (options.sketch !== undefined) {
    for (const wire of options.sketch) {
      items.push({ ...wire, overlay: true })
    }
  }

  return {
    camera: options.camera,
    theme: options.theme,
    showGrid: options.showGrid,
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
      return shapeForGate(element.gateType, element.invertedOutput)
    case 'button':
      return 'button'
    case 'pin':
      // La punta de un pin de entrada asoma por la derecha; la de uno de salida, por la
      // izquierda (ver `pinLayout`). El cheurón de la silueta apunta hacia la punta.
      return element.pinType === 'output' ? 'pinOutput' : 'pinInput'
    case 'constant':
      return 'constant'
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
function labelFor(
  element: DrawableDevice,
  resolveCircuit?: CircuitResolver,
): string | undefined {
  switch (element.kind) {
    case 'pin': {
      const name = element.name.trim()
      return name === '' ? undefined : name
    }
    case 'constant':
      return constantLabel(element)
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
