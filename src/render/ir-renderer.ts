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
  readonly wire: string
  readonly symbolFill: string
  readonly symbolStroke: string
  readonly selection: string
  /** Punto de un pin donde todavía no hay nada conectado. */
  readonly pinDot: string
  /** Símbolo apagado (sin energía en el circuito). */
  readonly stateOff: string
  /** Encendido, con un 0 dentro. */
  readonly stateZero: string
  /** Encendido, con un 1 dentro. */
  readonly stateOne: string
}

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
  readonly state: DeviceState
}

/** Un cable listo para pintar. */
export interface DrawWire {
  readonly kind: 'wire'
  readonly p1: GridPoint
  readonly p2: GridPoint
  readonly selected: boolean
  /** Ancho en bits del cable (1 = cable simple). Sirve para el grosor del bus. */
  readonly bitWidth?: number
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
