import type { GateType, GridPoint, Rotation, Signal } from '../core/model/types'
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

/** Colores ya resueltos a texto CSS. El renderizador no sabe nada de variables CSS. */
export interface RenderTheme {
  readonly background: string
  readonly gridDot: string
  readonly gridDotStrong: string
  readonly wire: string
  readonly symbolFill: string
  readonly symbolStroke: string
  readonly selection: string
}

/** Un símbolo (compuerta) listo para pintar. */
export interface DrawGate {
  readonly kind: 'gate'
  readonly gateType: GateType
  /** Esquina superior izquierda, en unidades de rejilla. */
  readonly position: GridPoint
  readonly rotation: Rotation
  readonly selected: boolean
}

/** Un cable listo para pintar. */
export interface DrawWire {
  readonly kind: 'wire'
  readonly p1: GridPoint
  readonly p2: GridPoint
  readonly bitWidth: number
  readonly signal: Signal
  readonly selected: boolean
}

/**
 * Pieza a dibujar.
 * Se irán añadiendo variantes (LED, interruptor, notas de texto…) sin romper nada.
 */
export type DrawItem = DrawGate | DrawWire

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
