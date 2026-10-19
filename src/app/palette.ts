/**
 * El catálogo de piezas que se pueden colocar (M2-27).
 *
 * Es la **única** lista: de aquí salen a la vez el panel (qué botones tiene) y las herramientas
 * del editor —`PlaceTool` es la unión de estos identificadores—, así que una pieza no puede
 * existir en el panel sin que el editor sepa colocarla, ni al revés.
 *
 * ⚠️ **Solo entra lo que se puede dibujar y simular.** Una pieza que se coloca y luego no se ve,
 * o que revienta al dar corriente, es peor que no ofrecerla: el 7 segmentos, las memorias, los
 * sensores y las matrices llegan con M2-05/M2-12. Tampoco se ofrecen compuertas negadas que el
 * motor no niega (el LED, el reloj) porque el dibujo diría algo que el circuito no hace (ver
 * `shapeForGate`).
 *
 * El interruptor que se coloca es **fijo**, y no por capricho: con el ratón no se pueden pulsar
 * dos a la vez, así que uno momentáneo no serviría para probar una AND de dos entradas. El
 * modelo respeta el valor por defecto del original (momentáneo); el que elige es el panel.
 */

import type { Diagram } from '../core/model/diagram'
import {
  MAX_GATE_INPUTS,
  buttonLayout,
  gateLayout,
  type SymbolLayout,
} from '../core/model/layout'
import type { Element, GateType, GridPoint } from '../core/model/types'

export type PieceGroup = 'gates' | 'tristate' | 'io'

/** Campos comunes a toda pieza que se puede colocar. */
interface PieceBase {
  readonly id: string
  readonly label: string
  readonly title: string
  readonly group: PieceGroup
}

/** Una compuerta, con sus entradas y su salida —quizá negada—. */
interface GatePiece extends PieceBase {
  readonly kind: 'gate'
  readonly gateType: GateType
  /** Cuántas entradas tiene, o `'variable'` si las elige quien coloca. */
  readonly inputCount: number | 'variable'
  readonly invertedOutput: boolean
}

/** Un interruptor de entrada. */
interface ButtonPiece extends PieceBase {
  readonly kind: 'button'
  readonly isToggle: boolean
  readonly inverted: boolean
}

export type Piece = GatePiece | ButtonPiece

/**
 * Cuántas entradas se pueden pedir desde el panel.
 *
 * El tope es el del modelo (`MAX_GATE_INPUTS`): no se recorta nada por gusto. El mínimo son dos,
 * porque una compuerta de una sola entrada es una NOT y tiene su propia pieza.
 */
export const MIN_PIECE_INPUTS = 2

/** Las piezas, en el orden en que las enseña el panel. */
export const PIECES = [
  {
    kind: 'gate',
    id: 'and',
    label: 'AND',
    title: 'Compuerta AND (A)',
    group: 'gates',
    gateType: 'and',
    inputCount: 'variable',
    invertedOutput: false,
  },
  {
    kind: 'gate',
    id: 'nand',
    label: 'NAND',
    title: 'Compuerta NAND: una AND con la salida negada',
    group: 'gates',
    gateType: 'and',
    inputCount: 'variable',
    invertedOutput: true,
  },
  {
    kind: 'gate',
    id: 'or',
    label: 'OR',
    title: 'Compuerta OR',
    group: 'gates',
    gateType: 'or',
    inputCount: 'variable',
    invertedOutput: false,
  },
  {
    kind: 'gate',
    id: 'nor',
    label: 'NOR',
    title: 'Compuerta NOR: una OR con la salida negada',
    group: 'gates',
    gateType: 'or',
    inputCount: 'variable',
    invertedOutput: true,
  },
  {
    kind: 'gate',
    id: 'xor',
    label: 'XOR',
    title: 'Compuerta XOR: uno o lo otro, pero no los dos',
    group: 'gates',
    gateType: 'xor',
    inputCount: 'variable',
    invertedOutput: false,
  },
  {
    kind: 'gate',
    id: 'xnor',
    label: 'XNOR',
    title: 'Compuerta XNOR: una XOR con la salida negada',
    group: 'gates',
    gateType: 'xor',
    inputCount: 'variable',
    invertedOutput: true,
  },
  {
    kind: 'gate',
    id: 'not',
    label: 'NOT',
    title: 'Inversor: una entrada, la contraria a la salida',
    group: 'gates',
    gateType: 'not',
    inputCount: 1,
    // El inversor del original **siempre** nace negado (`CircuitDescriptorList.cs`:
    // `Gate(GateType.Not, 1, true)`), y de ahí que su símbolo sea el triángulo con la bolita.
    // No es una vuelta de tuerca: el motor no sabe hacer una NOT sin negar —el original
    // directamente se planta (`Tracer.Fail`)—, así que pedirla así sería pedir algo que no
    // existe.
    invertedOutput: true,
  },
  {
    kind: 'gate',
    id: 'triState1',
    label: 'Tri-estado ↓',
    title: 'Tri-estado con la habilitación abajo',
    group: 'tristate',
    gateType: 'triState1',
    // Dos entradas, aunque una sea la habilitación: así lo crea el original
    // (`CircuitDescriptorList.cs` → `Gate(GateType.TriState1, 2, false)`).
    inputCount: 2,
    invertedOutput: false,
  },
  {
    kind: 'gate',
    id: 'triState2',
    label: 'Tri-estado ↑',
    title: 'Tri-estado con la habilitación arriba',
    group: 'tristate',
    gateType: 'triState2',
    inputCount: 2,
    invertedOutput: false,
  },
  {
    kind: 'gate',
    id: 'clock',
    label: 'Reloj',
    title: 'Reloj: su salida cambia sola, dos veces por ciclo',
    group: 'io',
    gateType: 'clock',
    inputCount: 0,
    invertedOutput: false,
  },
  {
    kind: 'gate',
    id: 'led',
    label: 'LED',
    title: 'LED: se enciende con un 1 (L)',
    group: 'io',
    gateType: 'led',
    inputCount: 1,
    invertedOutput: false,
  },
  {
    kind: 'button',
    id: 'button',
    label: 'Interruptor',
    title: 'Interruptor de entrada: se queda como se le deje (B)',
    group: 'io',
    isToggle: true,
    inverted: false,
  },
] as const satisfies readonly Piece[]

/** Las piezas que el editor sabe colocar. */
export type PlaceTool = (typeof PIECES)[number]['id']

/** Los títulos de los grupos del panel, en su orden. */
export const PIECE_GROUPS: readonly { readonly id: PieceGroup; readonly title: string }[] = [
  { id: 'gates', title: 'Compuertas' },
  { id: 'tristate', title: 'Tri-estado' },
  { id: 'io', title: 'Entradas y salidas' },
]

const BY_ID = new Map<PlaceTool, Piece>(PIECES.map((piece) => [piece.id, piece]))

/** La pieza con ese identificador. Se busca en el catálogo, que es lo que el panel enseña. */
export function findPiece(id: PlaceTool): Piece {
  const piece = BY_ID.get(id)
  if (piece === undefined) {
    throw new Error(`la paleta no tiene ninguna pieza «${id}»`)
  }
  return piece
}

/**
 * Cuántas entradas tiene la pieza.
 *
 * Solo las compuertas de entradas variables miran lo que haya elegido el panel; el resto manda.
 */
export function pieceInputs(piece: Piece, chosen: number): number {
  if (piece.kind === 'button') {
    return 0
  }
  return piece.inputCount === 'variable' ? chosen : piece.inputCount
}

/**
 * Lo que ocupa la pieza, para saber si el sitio está libre **antes** de colocarla.
 *
 * Es el sitio del modelo (`layout.ts`), no una cuenta aparte: si el dibujo y el hueco se
 * calcularan por separado, cualquier día no coincidirían y se apilarían símbolos.
 */
export function pieceLayout(piece: Piece, chosen: number): SymbolLayout {
  return piece.kind === 'button'
    ? buttonLayout(piece.inverted)
    : gateLayout(piece.gateType, pieceInputs(piece, chosen), piece.invertedOutput)
}

/**
 * Coloca la pieza en el circuito.
 *
 * El sitio y el hueco libre los decide quien llama (el editor), que es también quien envuelve
 * la colocación en una sola acción de deshacer.
 */
export function placePiece(
  diagram: Diagram,
  piece: Piece,
  position: GridPoint,
  chosen: number,
): Element {
  if (piece.kind === 'button') {
    return diagram.addButton(position, { isToggle: piece.isToggle, inverted: piece.inverted })
  }
  return diagram.addGate(
    piece.gateType,
    position,
    pieceInputs(piece, chosen),
    piece.invertedOutput,
  )
}

/** El tope de entradas, reexportado para que el panel no tenga que saber de `layout`. */
export { MAX_GATE_INPUTS }
