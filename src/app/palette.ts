/**
 * El catálogo de piezas que se pueden colocar (M2-27).
 *
 * Es la **única** lista: de aquí salen a la vez el panel (qué botones tiene) y las herramientas
 * del editor —`PlaceTool` es la unión de estos identificadores—, así que una pieza no puede
 * existir en el panel sin que el editor sepa colocarla, ni al revés.
 *
 * ⚠️ **Solo entra lo que se puede dibujar y simular.** Una pieza que se coloca y luego no se ve,
 * o que revienta al dar corriente, es peor que no ofrecerla: el 7 segmentos, las memorias y
 * las matrices llegan con M2-05. Tampoco se ofrecen compuertas negadas que el motor no niega
 * (el LED, el reloj) porque el dibujo diría algo que el circuito no hace (ver `shapeForGate`).
 *
 * El interruptor que se coloca es **fijo**, y no por capricho: con el ratón no se pueden pulsar
 * dos a la vez, así que uno momentáneo no serviría para probar una AND de dos entradas. El
 * modelo respeta el valor por defecto del original (momentáneo); el que elige es el panel.
 */

import type { Diagram } from '../core/model/diagram'
import {
  MAX_GATE_INPUTS,
  buttonLayout,
  constantLayout,
  gateLayout,
  pinLayout,
  probeLayout,
  sensorLayout,
  memoryLayout,
  splitterLayout,
  type SymbolLayout,
} from '../core/model/layout'
import type {
  Constant,
  Element,
  GateType,
  GridPoint,
  PinType,
  Splitter,
} from '../core/model/types'
import { shapeForGate, type SymbolShape } from '../render/symbols'

export type PieceGroup = 'gates' | 'tristate' | 'io' | 'pins' | 'bits'

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

/** Un pin de la hoja: la conexión de un subcircuito con el exterior. */
interface PinPiece extends PieceBase {
  readonly kind: 'pin'
  readonly pinType: Exclude<PinType, 'none'>
}

/** Una constante de un bit. El ancho se podrá elegir en el inspector más adelante. */
interface ConstantPiece extends PieceBase {
  readonly kind: 'constant'
  readonly value: number
}

/** Un repartidor de bits con un ancho y un número de salidas fijos. */
interface SplitterPiece extends PieceBase {
  readonly kind: 'splitter'
  readonly bitWidth: number
  readonly pinCount: number
  readonly clockwise: boolean
}

/** Una probeta: mira un cable y guarda su historial para el osciloscopio. */
interface ProbePiece extends PieceBase {
  readonly kind: 'probe'
}

/** Un sensor: produce un valor de N bits que cambia con el tiempo o a mano. */
interface SensorPiece extends PieceBase {
  readonly kind: 'sensor'
}

/** Una memoria (ROM o RAM): direccionada por un bus, lee/escribe un dato. */
interface MemoryPiece extends PieceBase {
  readonly kind: 'memory'
}

export type Piece =
  | GatePiece
  | ButtonPiece
  | PinPiece
  | ConstantPiece
  | SplitterPiece
  | ProbePiece
  | SensorPiece
  | MemoryPiece

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
    kind: 'gate',
    id: 'sevenSegment',
    label: '7 segmentos',
    title: 'Display de 7 segmentos: 8 entradas (a-g + punto)',
    group: 'io',
    gateType: 'led',
    inputCount: 8,
    invertedOutput: false,
  },
  {
    kind: 'probe',
    id: 'probe',
    label: 'Sonda',
    title: 'Sonda: mira un cable y guarda su historial para el osciloscopio',
    group: 'io',
  },
  {
    kind: 'sensor',
    id: 'sensor',
    label: 'Sensor',
    title: 'Sensor: genera un valor de N bits (aleatorio, manual, serie…)',
    group: 'io',
  },
  {
    kind: 'memory',
    id: 'memory',
    label: 'Memoria',
    title: 'Memoria (ROM/RAM): direccionada por un bus, lee/escribe un dato',
    group: 'io',
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
  {
    kind: 'pin',
    id: 'pin-input',
    label: 'Pin IN',
    title: 'Pin de entrada de la hoja: la señal entra al subcircuito por aquí',
    group: 'pins',
    pinType: 'input',
  },
  {
    kind: 'pin',
    id: 'pin-output',
    label: 'Pin OUT',
    title: 'Pin de salida de la hoja: la señal sale del subcircuito por aquí',
    group: 'pins',
    pinType: 'output',
  },
  {
    kind: 'constant',
    id: 'const-0',
    label: 'Const 0',
    title: 'Constante de un bit con valor 0',
    group: 'bits',
    value: 0,
  },
  {
    kind: 'constant',
    id: 'const-1',
    label: 'Const 1',
    title: 'Constante de un bit con valor 1',
    group: 'bits',
    value: 1,
  },
  {
    kind: 'splitter',
    id: 'splitter-4',
    label: 'Bus 4→2',
    title: 'Repartidor: un bus de 4 bits en dos cables de 2 bits',
    group: 'bits',
    bitWidth: 4,
    pinCount: 2,
    clockwise: true,
  },
  {
    kind: 'splitter',
    id: 'splitter-8',
    label: 'Bus 8→2',
    title: 'Repartidor: un bus de 8 bits en dos cables de 4 bits',
    group: 'bits',
    bitWidth: 8,
    pinCount: 2,
    clockwise: true,
  },
] as const satisfies readonly Piece[]

/** Las piezas que el editor sabe colocar. */
export type PlaceTool = (typeof PIECES)[number]['id']

/** Los títulos de los grupos del panel, en su orden. */
export const PIECE_GROUPS: readonly { readonly id: PieceGroup; readonly title: string }[] = [
  { id: 'gates', title: 'Compuertas' },
  { id: 'tristate', title: 'Tri-estado' },
  { id: 'io', title: 'Entradas y salidas' },
  { id: 'pins', title: 'Pines de la hoja' },
  { id: 'bits', title: 'Buses y constantes' },
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
  if (piece.kind !== 'gate') {
    return 0
  }
  return piece.inputCount === 'variable' ? chosen : piece.inputCount
}

/** Una constante de mentira, solo para preguntar al modelo cuánto ocupa. */
function previewConstant(piece: ConstantPiece): Constant {
  return {
    kind: 'constant',
    id: 'preview',
    circuitId: 'preview',
    layerId: 'preview',
    position: { x: 0, y: 0 },
    rotation: 'up',
    bitWidth: 1,
    value: piece.value,
    pinSide: 'right',
  }
}

/** Un repartidor de mentira, solo para preguntar al modelo cuánto ocupa. */
function previewSplitter(piece: SplitterPiece): Splitter {
  return {
    kind: 'splitter',
    id: 'preview',
    circuitId: 'preview',
    layerId: 'preview',
    position: { x: 0, y: 0 },
    rotation: 'up',
    bitWidth: piece.bitWidth,
    pinCount: piece.pinCount,
    clockwise: piece.clockwise,
  }
}

/**
 * Lo que ocupa la pieza, para saber si el sitio está libre **antes** de colocarla.
 *
 * Es el sitio del modelo (`layout.ts`), no una cuenta aparte: si el dibujo y el hueco se
 * calcularan por separado, cualquier día no coincidirían y se apilarían símbolos.
 */
export function pieceLayout(piece: Piece, chosen: number): SymbolLayout {
  switch (piece.kind) {
    case 'gate':
      return gateLayout(piece.gateType, pieceInputs(piece, chosen), piece.invertedOutput)
    case 'button':
      return buttonLayout(piece.inverted)
    case 'pin':
      return pinLayout({ pinType: piece.pinType, bitWidth: 1, inverted: false })
    case 'constant':
      return constantLayout(previewConstant(piece))
    case 'probe':
      return probeLayout('left')
    case 'sensor':
      return sensorLayout('right')
    case 'memory':
      return memoryLayout(4, 4)
    case 'splitter':
      return splitterLayout(previewSplitter(piece))
  }
}

/**
 * La silueta que le toca a la pieza en la vista previa.
 *
 * Vive aquí, junto a `pieceLayout`, para que la paleta y el lienzo no se separen cuando se
 * añade un tipo de pieza. Si una pieza no tiene silueta devuelve `null` y la vista previa se
 * queda vacía, pero no revienta.
 */
export function pieceShape(piece: Piece): SymbolShape | null {
  switch (piece.kind) {
    case 'gate':
      return shapeForGate(piece.gateType, piece.invertedOutput)
    case 'button':
      return 'button'
    case 'pin':
      return piece.pinType === 'output' ? 'pinOutput' : 'pinInput'
    case 'constant':
      return 'constant'
    case 'probe':
      return 'probe'
    case 'sensor':
      return 'sensor'
    case 'memory':
      return 'memory'
    case 'splitter':
      return 'splitter'
    default:
      return null
  }
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
  switch (piece.kind) {
    case 'gate':
      return diagram.addGate(
        piece.gateType,
        position,
        pieceInputs(piece, chosen),
        piece.invertedOutput,
      )
    case 'button':
      return diagram.addButton(position, { isToggle: piece.isToggle, inverted: piece.inverted })
    case 'pin':
      // El pin de entrada se dibuja a la izquierda de la hoja y el de salida a la derecha,
      // que es el lado por defecto del original (`BasePin.DefaultSide`).
      return diagram.addPin(position, {
        pinType: piece.pinType,
        side: piece.pinType === 'input' ? 'left' : 'right',
        bitWidth: 1,
      })
    case 'constant':
      return diagram.addConstant(position, {
        bitWidth: 1,
        value: piece.value,
        pinSide: 'right',
      })
    case 'probe':
      return diagram.addProbe(position)
    case 'sensor':
      return diagram.addSensor(position)
    case 'memory':
      return diagram.addMemory(position)
    case 'splitter':
      return diagram.addSplitter(position, {
        bitWidth: piece.bitWidth,
        pinCount: piece.pinCount,
        clockwise: piece.clockwise,
      })
  }
}

/** El tope de entradas, reexportado para que el panel no tenga que saber de `layout`. */
export { MAX_GATE_INPUTS }
