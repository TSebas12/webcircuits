/**
 * Tipos base del modelo de circuitos (M1-01).
 *
 * Este módulo es **solo tipos**: ni una línea de lógica y ninguna dependencia del
 * navegador. Es la frontera más importante del proyecto: `src/core/` no puede mirar
 * jamás hacia `render/`, `app/` ni `worker/`.
 *
 * El vocabulario sale del original en C#:
 *   `LogicCircuit-ref/Sources/LogicCircuit/CircuitProject/`
 *
 * ⚠️ Coordenadas: aquí TODO está en **unidades de rejilla** (enteras), nunca en píxeles.
 * La conversión a píxeles es cosa del renderizado (`src/render/geometry.ts`).
 */

/** Identificador único de un elemento o de un circuito. */
export type Id = string

/**
 * Coordenada en **unidades de rejilla**.
 *
 * En el original, `Symbol.GridSize = 18`: una unidad son 18 px al 100 % de zoom.
 * Ese 18 es sagrado (de él dependen la posición de los pines y el ajuste de la rejilla),
 * pero aquí no aparecen píxeles por ningún lado.
 */
export interface GridPoint {
  readonly x: number
  readonly y: number
}

/**
 * Valor lógico que transporta un cable: una **máscara de bits**.
 *
 * - 1 bit  → cable simple: `0` o `1`
 * - n bits → bus: el bit menos significativo viaja en el bit 0 de la máscara
 *
 * El original permite hasta `BasePin.MaxBitWidth = 32` bits, así que cabe de sobra en
 * los operadores de bits de JavaScript (que trabajan a 32 bits).
 */
export type Signal = number

/** Ancho máximo de un cable, en bits (original: `BasePin.MaxBitWidth`). */
export const MAX_BIT_WIDTH = 32

/** ¿El pin es una entrada, una salida, o ninguna de las dos? */
export type PinType = 'input' | 'output' | 'none'

/** Lado del símbolo en el que se dibuja el pin. */
export type PinSide = 'left' | 'right' | 'top' | 'bottom'

/** Orientación del símbolo dentro de la rejilla. */
export type Rotation = 'up' | 'right' | 'down' | 'left'

/**
 * Tipos de compuerta (original: `GateType`).
 *
 * En el original hay un solo enumerado para todo: compuertas, LED, reloj, tri-estado…
 * Nosotros separamos «compuertas lógicas» de «dispositivos», que es más claro, pero
 * los nombres coinciden para que el mapeo con el formato del fichero sea directo.
 */
export type GateType = 'not' | 'or' | 'and' | 'xor' | 'nand' | 'nor' | 'xnor'

/** Base común a todo lo que vive dentro de un circuito. */
export interface ElementBase {
  readonly id: Id
  /** Circuito (hoja o subcircuito) al que pertenece. */
  readonly circuitId: Id
}

/** Un cable: dos extremos sobre la rejilla. */
export interface Wire extends ElementBase {
  readonly kind: 'wire'
  readonly p1: GridPoint
  readonly p2: GridPoint
  /** Cuántos bits transporta. `1` = cable simple. */
  readonly bitWidth: number
}

/** Un pin: la conexión de un símbolo (o de la propia hoja) con el exterior. */
export interface Pin extends ElementBase {
  readonly kind: 'pin'
  readonly pinType: PinType
  readonly side: PinSide
  readonly bitWidth: number
  readonly inverted: boolean
  readonly name: string
  /** Orden dentro de su lado. */
  readonly index: number
}

/**
 * Un símbolo colocado sobre la rejilla: ocupa celdas y tiene pines.
 * Es la parte común de compuertas, interruptores, LED, memorias…
 */
export interface Device extends ElementBase {
  /** Esquina superior izquierda, en unidades de rejilla. */
  readonly position: GridPoint
  readonly rotation: Rotation
  readonly bitWidth: number
  /** Pines que pertenecen a este símbolo. */
  readonly pinIds: readonly Id[]
}

/** Una compuerta lógica. */
export interface Gate extends Device {
  readonly kind: 'gate'
  readonly gateType: GateType
}

/** Cualquier cosa que se pueda colocar en un circuito. */
export type Element = Gate | Pin | Wire

/**
 * Un circuito: una hoja (lo que se dibuja) o un subcircuito.
 * En el original, `LogicalCircuit`.
 */
export interface Circuit {
  readonly id: Id
  readonly name: string
  readonly elements: readonly Element[]
}

/** Un proyecto completo: lo que se guarda en un fichero `.CircuitProject`. */
export interface Project {
  readonly id: Id
  readonly name: string
  readonly circuits: readonly Circuit[]
  /** Circuito que se abre al cargar. */
  readonly mainCircuitId: Id
}
