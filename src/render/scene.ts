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

import { deviceLayout } from '../core/model/layout'
import { junctionPoints } from '../core/simulate/nets'
import type { DeviceState, Element, Id } from '../core/model/types'
import type { CameraState } from './camera'
import type {
  DrawDevice,
  DrawItem,
  DrawPinDot,
  DrawWire,
  RenderScene,
  RenderTheme,
} from './ir-renderer'
import { shapeForGate } from './symbols'

export interface SceneOptions {
  readonly elements: readonly Element[]
  /** Estado de cada dispositivo. Lo que no esté, se pinta apagado. */
  readonly states: ReadonlyMap<Id, DeviceState>
  readonly selected: ReadonlySet<Id>
  readonly camera: CameraState
  readonly theme: RenderTheme
  readonly showGrid: boolean
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
      items.push({
        kind: 'wire',
        p1: element.p1,
        p2: element.p2,
        selected: options.selected.has(element.id),
      })
    }
  }

  for (const element of options.elements) {
    if (element.kind === 'wire') {
      continue
    }

    // El LED es una compuerta, y el interruptor no; de ahí el `?? 'button'`.
    const shape =
      element.kind === 'gate' ? shapeForGate(element.gateType, element.invertedOutput) : 'button'
    if (shape === null) {
      // Compuerta que todavía no sabemos dibujar. Se ignora en vez de reventar: así
      // cargar un circuito con compuertas de M2 no rompe nada.
      continue
    }

    const layout = deviceLayout(element)
    const device: DrawDevice = {
      kind: 'device',
      shape,
      position: element.position,
      rotation: element.rotation,
      width: layout.width,
      height: layout.height,
      selected: options.selected.has(element.id),
      state: options.states.get(element.id) ?? 'off',
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
