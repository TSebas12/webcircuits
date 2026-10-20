/**
 * Una fila de la tabla de verdad (M8).
 *
 * Es el equivalente de `TruthState` del original: los valores de las entradas y los de las
 * salidas, ya empaquetados como enteros. El filtro de la tabla lee exactamente esta forma
 * (`ExpressionState`), así que no hay que convertir nada entre el motor y el parser.
 */
import type { ExpressionState } from '../expression-parser'
import type { Id } from '../model/types'

/** Un pin que aparece como columna de la tabla. */
export interface TruthTablePin {
  readonly id: Id
  readonly name: string
  readonly bitWidth: number
}

/** Una fila: entradas y salidas, en el orden de sus columnas. */
export interface TruthState extends ExpressionState {
  readonly input: readonly number[]
  readonly output: readonly number[]
}

/** El resultado completo de generar una tabla. */
export interface TruthTable {
  readonly inputs: readonly TruthTablePin[]
  readonly outputs: readonly TruthTablePin[]
  readonly rows: readonly TruthState[]
  /** Se dejó de generar al llegar al límite o al cancelar. */
  readonly truncated: boolean
  /** Cuántas combinaciones hay en total (antes del filtro), como número seguro. */
  readonly totalRows: number
}

/** Lo que se puede pedir al generador. */
export interface TruthTableOptions {
  /** Tope de filas que se guardan. El original usa `1 << 12`. */
  readonly maxRows?: number
  /** Expresión de filtro; vacía o ausente = todas las filas. */
  readonly filter?: string
  /** Invierte el filtro, como la casilla del original. */
  readonly invertFilter?: boolean
  /** Se llama de vez en cuando para poder cancelar. */
  readonly keepGoing?: () => boolean
  /** Progreso entre 0 y 1. */
  readonly onProgress?: (fraction: number) => void
}

/** El tope del original (`DialogTruthTable.MaxRows`). */
export const DEFAULT_MAX_ROWS = 1 << 12
