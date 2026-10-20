import type { DeviceState, GridPoint, Rotation } from '../core/model/types'
import type { SymbolShape } from './symbols'
import type { CameraState } from './camera'

/**
 * La frontera entre la aplicación y el dibujado (M1-02).
 *
 * El renderizador **no conoce el modelo**: no va a buscar nada al proyecto ni sabe
 * qué es un `Circuit`. Recibe una **lista de piezas ya resueltas**. Eso es lo que
 * permitirá cambiar Canvas 2D por WebGL (o por lo que venga) sin tocar la aplicación.
 *
 * `src/core/` **no importa** este fichero. Nunca.
 */

export type { DeviceState }

/** Colores ya resueltos a texto CSS. El renderizador no sabe nada de variables CSS. */
export interface RenderTheme {
  readonly background: string
  readonly gridDot: string
  readonly gridDotStrong: string
  /** Cable en reposo (edición, o sin corriente). */
  readonly wireIdle: string
  /** Cable con un 1. */
  readonly wireHigh: string
  /** Cable con un 0. */
  readonly wireLow: string
  /** Cable sin nada que lo fije. */
  readonly wireFloating: string
  /** Cable de bus (más de un bit). */
  readonly wireBus: string
  /** Cable seleccionado. */
  readonly wireSelected: string
  readonly symbolFill: string
  readonly symbolStroke: string
  /** Texto de las etiquetas de compuerta. */
  readonly gateText: string
  /** Color de error de una pieza (conflicto de salidas…). */
  readonly gateError: string
  readonly selection: string
  /** Resalte al pasar el ratón. */
  readonly hover: string
  /** Punto de un pin donde todavía no hay nada conectado. */
  readonly pinDot: string
  /** Tiradores de una selección (esquinas, puntos de control). */
  readonly handle: string
  /** Símbolo apagado (sin energía en el circuito). */
  readonly stateOff: string
  /** Encendido, con un 0 dentro. */
  readonly stateZero: string
  /** Encendido, con un 1 dentro. */
  readonly stateOne: string
}

/** El estado eléctrico de un cable, para elegir su color. */
export type WireSignal = 'idle' | 'high' | 'low' | 'floating'

/** Un símbolo (compuerta, interruptor, LED) listo para pintar. */
export interface DrawDevice {
  readonly kind: 'device'
  readonly shape: SymbolShape
  /** Esquina superior izquierda, en unidades de rejilla. */
  readonly position: GridPoint
  readonly rotation: Rotation
  /** Tamaño en unidades de rejilla. Coincide con el que calcula `core/model/layout.ts`. */
  readonly width: number
  readonly height: number
  readonly selected: boolean
  /** El cursor está encima: se resalta con `theme.hover` (M6-06). */
  readonly hovered?: boolean
  readonly state: DeviceState
  /**
   * Opacidad efectiva de la capa a la que pertenece (M5). El render la aplica como
   * `globalAlpha` al pintar el símbolo.
   */
  readonly layerOpacity?: number
  /**
   * Texto que va dentro del símbolo: el valor de una constante, el nombre de un subcircuito
   * o el de un pin de hoja. No se guarda en la silueta porque cambia con el elemento.
   */
  readonly label?: string
}

/** Un cable listo para pintar. */
export interface DrawWire {
  readonly kind: 'wire'
  readonly p1: GridPoint
  readonly p2: GridPoint
  readonly selected: boolean
  /** El cursor está encima: se resalta con `theme.hover` (M6-06). */
  readonly hovered?: boolean
  /** Estado eléctrico: decide el color (M6-03). */
  readonly signal: WireSignal
  /** Transporta un bus (más de un bit): se pinta más grueso (M6-15). */
  readonly bus: boolean
  /** Color forzado a mano para este cable (M6-14). Gana al color por estado. */
  readonly color?: string
  /**
   * Opacidad efectiva de la capa a la que pertenece (M5).
   */
  readonly layerOpacity?: number
  /**
   * Es un cable **provisional** (el que se está tendiendo), no del circuito.
   *
   * Vive en la capa de encima: cambia a cada movimiento del ratón, así que no puede formar
   * parte de la capa cacheada (M2-17).
   */
  readonly overlay?: boolean
}

/** El puntito de un pin, para ver dónde se puede conectar un cable. */
export interface DrawPinDot {
  readonly kind: 'pinDot'
  readonly point: GridPoint
  /** Ya tiene algo apoyado: un cable o otro pin. */
  readonly connected: boolean
  /** Grande y destacado: se está tendiendo un cable y aquí se puede terminar. */
  readonly emphasized?: boolean
}

/**
 * El punto donde se juntan tres o más cables.
 *
 * En el original se llama *solder* y va el primero de todos, en `Z = 0`
 * (`EditorDiagram.UpdateSolders`): es un remache que une cables, así que se pinta **debajo**
 * incluso del cable.
 */
export interface DrawJunction {
  readonly kind: 'junction'
  readonly point: GridPoint
}

/**
 * Pieza a dibujar.
 * Se irán añadiendo variantes (notas de texto, buses…) sin romper nada.
 */
export type DrawItem = DrawDevice | DrawWire | DrawJunction | DrawPinDot

/**
 * ¿La pieza vive en la **capa de encima**?
 *
 * La capa de encima cambia con el ratón y se dibuja siempre del natural. La de abajo
 * (cables, uniones y símbolos) es estable y es la que se cachea (M2-17). Los pines y el
 * cable provisional están en la de encima; lo demás, en la de abajo.
 */
export function isOverlayItem(item: DrawItem): boolean {
  return item.kind === 'pinDot' || (item.kind === 'wire' && item.overlay === true)
}

/** Todo lo que hace falta para pintar un fotograma. */
export interface RenderScene {
  readonly camera: CameraState
  readonly theme: RenderTheme
  readonly showGrid: boolean
  readonly items: readonly DrawItem[]
}

/** Medidas del bucle de dibujado, para el contador de FPS y para `bench/`. */
export interface RendererStats {
  /** Fotogramas por segundo del bucle. */
  readonly fps: number
  /** Milisegundos que costó el último repintado real. */
  readonly paintMs: number
  /** Repintados por segundo. Es `0` cuando nada ha cambiado y se salta el dibujado. */
  readonly paints: number
}

export interface RendererOptions {
  /** Se llama cada ~medio segundo con las medidas. */
  readonly onStats?: (stats: RendererStats) => void
}

/** El contrato que cumple cualquier backend de dibujado. */
export interface IRenderer {
  /** Prepara el lienzo y arranca el bucle. */
  init(canvas: HTMLCanvasElement, options?: RendererOptions): void
  /**
   * Ajusta el búfer al tamaño indicado en píxeles CSS.
   * El tamaño en CSS lo manda el contenedor; esto solo ajusta la resolución real.
   */
  resize(cssWidth: number, cssHeight: number): void
  /** Pide que se pinte esta escena en el siguiente fotograma. */
  render(scene: RenderScene): void
  /** Detiene el bucle y libera todo. */
  destroy(): void
}
