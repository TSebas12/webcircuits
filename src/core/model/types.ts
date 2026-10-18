/**
 * Tipos base del modelo de circuitos.
 *
 * Este módulo es **solo tipos** (salvo un par de constantes): ni una línea de lógica y
 * ninguna dependencia del navegador. Es la frontera más importante del proyecto:
 * `src/core/` no puede mirar jamás hacia `render/`, `app/` ni `worker/`.
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
 * los 32 bits con los que trabajan los operadores de bits de JavaScript.
 */
export type Signal = number

/** Ancho máximo de un cable, en bits (original: `BasePin.MaxBitWidth`). */
export const MAX_BIT_WIDTH = 32

/** ¿El pin es una entrada, una salida, o ninguna de las dos? */
export type PinType = 'input' | 'output' | 'none'

/**
 * Estado visual de un dispositivo.
 *
 * Son los tres del original (`Function/State.cs`: `Off = 0`, `On0 = 1`, `On1 = 2`), y
 * distinguirlos importa: un LED con el circuito apagado **no** se ve igual que un LED
 * encendido al que le llega un 0.
 */
export type DeviceState = 'off' | 'zero' | 'one'

/** Rectángulo en unidades de rejilla. */
export interface GridRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** Lado del símbolo en el que se dibuja el pin. */
export type PinSide = 'left' | 'right' | 'top' | 'bottom'

/**
 * Orientación del símbolo dentro de la rejilla (original: `Rotation`).
 *
 * ⚠️ Ojo con el nombre: `up` es la orientación **natural** del dibujo, que es la que
 * apunta hacia la derecha (el pico de una AND mira a la derecha). El original define
 * `Angle(Up) = 0` y dibuja la compuerta mirando a la derecha.
 */
export type Rotation = 'up' | 'right' | 'down' | 'left'

/**
 * Tipos de compuerta (original: `CircuitProject/GateType.cs`).
 *
 * Se respetan **todos** los valores del enumerado original, incluidos `odd`, `even` y
 * `probe`: existen, pero no son compuertas que se puedan colocar. Mantenerlos hace que
 * el mapeo con el formato de fichero `.CircuitProject` sea directo.
 *
 * ⚠️ No hay `nand`, `nor` ni `xnor`: en el original una NAND es una `and` con
 * `invertedOutput = true`. Así queda en el fichero, y así lo modelamos.
 */
export type GateType =
  | 'nop'
  | 'clock'
  | 'not'
  | 'or'
  | 'and'
  | 'xor'
  | 'odd'
  | 'even'
  | 'led'
  | 'probe'
  | 'triState1'
  | 'triState2'

/** Base común a todo lo que vive dentro de un circuito. */
export interface ElementBase {
  readonly id: Id
  /** Circuito (hoja o subcircuito) al que pertenece. */
  readonly circuitId: Id
}

/**
 * Un cable.
 *
 * ⚠️ Es **solo geometría**: dos puntos de la rejilla. No guarda a qué está conectado.
 * En el original la conectividad se **deduce** de la posición (su `ConductorMap`), y eso
 * es lo que permite que dos cables se unan por tocarse en una esquina. Por eso el modelo
 * no tiene un campo «pin de origen»: lo calcula el motor.
 */
export interface Wire extends ElementBase {
  readonly kind: 'wire'
  readonly p1: GridPoint
  readonly p2: GridPoint
  /** Cuántos bits transporta. `1` = cable simple. */
  readonly bitWidth: number
}

/**
 * Un pin de la propia hoja: la conexión del circuito con el exterior.
 * No confundir con los pines de un dispositivo, que se **deducen** de su forma
 * (ver `layout.ts`).
 */
export interface Pin extends ElementBase {
  readonly kind: 'pin'
  readonly pinType: PinType
  readonly side: PinSide
  readonly bitWidth: number
  readonly inverted: boolean
  readonly name: string
}

/** Un símbolo colocado sobre la rejilla. */
export interface Device extends ElementBase {
  /** Esquina superior izquierda, en unidades de rejilla. */
  readonly position: GridPoint
  readonly rotation: Rotation
}

/** Una compuerta lógica. */
export interface Gate extends Device {
  readonly kind: 'gate'
  readonly gateType: GateType
  /** Cuántas entradas tiene. Para las compuertas, entre 1 y `MAX_GATE_INPUTS`. */
  readonly inputCount: number
  /** Salida negada: así se hace una NAND (`gateType: 'and'` + `invertedOutput`). */
  readonly invertedOutput: boolean
}

/**
 * Un interruptor de entrada.
 *
 * ⚠️ En el original esto se llama `CircuitButton` (`CircuitProject/CircuitButton.cs`) y
 * **no** es un «switch»: es el botón que el usuario pulsa para meter un 1 o un 0.
 */
export interface Button extends Device {
  readonly kind: 'button'
  /**
   * `false` —que es el valor por defecto del original— lo hace **momentáneo**: está a 1
   * mientras se pulsa y vuelve a 0 al soltar. Con `true` se queda como se lo deje.
   */
  readonly isToggle: boolean
  /** Salida negada: pulsado da un 0 y suelto da un 1. */
  readonly inverted: boolean
}

/**
 * Cualquier cosa que se pueda colocar en un circuito.
 *
 * Los pines de la hoja (`Pin`) todavía no están: llegan con los subcircuitos (M2).
 */
export type Element = Gate | Button | Wire

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
