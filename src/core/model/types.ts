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
export type CircuitShape = 'Rectangular' | 'Display' | 'Mux' | 'Demux' | 'Alu' | 'FlipFlop'
export type GateShape = 'Rectangular' | 'Shaped'

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
  /** Capa a la que pertenece el elemento. Por defecto, la capa "Principal". */
  readonly layerId: Id
}

/** Identificador de la capa por defecto (original: la capa "Principal"). */
export const DEFAULT_LAYER_ID: Id = 'principal'

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
 *
 * Es un elemento **colocado**, como todo lo demás: en el original un pin es un `Circuit`
 * (`CircuitProject/Pin.cs`) que además lleva su propio `CircuitSymbol`, y por eso el
 * fichero guarda su `X`, su `Y` y su `Rotation` junto al `PinId`. `position` es dónde se
 * dibuja el pin dentro de su hoja (de ahí sale su **punta interior**, la de dentro); su
 * **punta exterior** —la que toca el símbolo del subcircuito en la hoja de arriba— se
 * **deduce** del lado y del número de pines, igual que en el original
 * (`Circuit.UpdatePin`), y no se guarda.
 */
export interface Pin extends Device {
  readonly kind: 'pin'
  readonly pinType: PinType
  /** Lado de la caja del circuito por el que asoma (original: `PinSide`). */
  readonly side: PinSide
  readonly bitWidth: number
  readonly inverted: boolean
  readonly name: string
}

/**
 * Un subcircuito colocado: una pieza que representa a otro circuito de la hoja
 * (original: el `CircuitSymbol` cuyo `Circuit` es un `LogicalCircuit`).
 *
 * ⚠️ Ojo con los dos circuitos que lleva: `circuitId` —heredado de `Device`— es la hoja
 * **donde está colocado**, y `targetCircuitId` es el circuito que **representa**. En el
 * original son `CircuitSymbol.LogicalCircuit` y `CircuitSymbol.Circuit`.
 */
export interface CircuitInstance extends Device {
  readonly kind: 'circuit'
  readonly targetCircuitId: Id
}

/**
 * Todo lo que se puede **colocar** en una hoja y tiene forma (original: `CircuitSymbol`).
 *
 * Los cables van aparte porque se colocan distinto: no tienen posición, tienen dos puntas.
 *
 * ⚠️ De todo esto, el editor solo sabe colocar hoy compuertas e interruptores. Los pines de
 * hoja y los subcircuitos están modelados porque el mapa de simulación ya los entiende
 * (M2-07) y no había razón para rehacerlo luego; los demás dispositivos (constantes,
 * memorias, sensores, repartidores…) están modelados **y nada más**: su forma y su
 * comportamiento llegan con M2-05 y M2-12, y hasta entonces no saben dibujarse.
 */
export type PlacedElement =
  | Gate
  | Button
  | Pin
  | CircuitInstance
  | Constant
  | Memory
  | LedMatrix
  | Sensor
  | Sound
  | GraphicsArray
  | Splitter

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
 * Un valor constante (original: `Constant`).
 *
 * Tiene una unica salida del ancho indicado. `value` se normaliza al ancho.
 */
export interface Constant extends Device {
  readonly kind: 'constant'
  readonly bitWidth: number
  readonly value: number
  readonly pinSide: PinSide
}

/**
 * Memoria (ROM o RAM) (original: `Memory`).
 */
export interface Memory extends Device {
  readonly kind: 'memory'
  readonly addressBitWidth: number
  readonly dataBitWidth: number
  readonly isRom: boolean
}

/**
 * Sensor (original: `Sensor`).
 */
export interface Sensor extends Device {
  readonly kind: 'sensor'
  readonly sensorType: string
}

/**
 * Repartidor de bits (original: `Splitter`).
 *
 * ⚠️ Los campos son **los del fichero** (`.CircuitProject`: `BitWidth`, `PinCount`,
 * `Clockwise`). En una versión anterior de este modelo se llamaban `splitWidth` e
 * `isJoin`, que no venían de ningún sitio: se corrigieron al portar el mapa de simulación,
 * que necesita saber cuántos pines hay y hacia dónde apuntan para atravesar el repartidor
 * (`Splitter.Pass`).
 */
export interface Splitter extends Device {
  readonly kind: 'splitter'
  /** Ancho total, en bits. */
  readonly bitWidth: number
  /** Cuántos cables reparte. Nunca menos de 2 (el original lo sube solo). */
  readonly pinCount: number
  /** Sentido de los pines finos: `true` los pone a la derecha del ancho. */
  readonly clockwise: boolean
}

/**
 * Sonido (original: `Sound`). Una entrada de 1 bit.
 */
export interface Sound extends Device {
  readonly kind: 'sound'
  readonly pinSide: PinSide
}

/**
 * Matriz gráfica (original: `GraphicsArray`).
 */
export interface GraphicsArray extends Device {
  readonly kind: 'graphicsArray'
  readonly bitWidth: number
  readonly width: number
  readonly height: number
}

/**
 * Matriz de LEDs (original: `LedMatrix`).
 */
export interface LedMatrix extends Device {
  readonly kind: 'ledMatrix'
  readonly rows: number
  readonly columns: number
}

/**
 * Nota de texto (original: `TextNote`).
 */
export interface TextNote extends Device {
  readonly kind: 'textNote'
}

/**
 * Unión de cables (original: `Jam`): un punto donde se unen varios cables.
 * No es un dispositivo colocado: se deriva de la posición.
 */
export interface Jam {
  readonly point: GridPoint
  readonly pinType: PinType
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
 * Los pines de la hoja y los subcircuitos son elementos del modelo (`PlacedElement`) pero
 * todavía **no** de esta lista: el editor aún no sabe colocarlos, así que no pueden
 * aparecer en un documento. El mapa de simulación sí los entiende (ver `PlacedElement`).
 */
export type Element = Gate | Button | Wire

/**
 * Un circuito: una hoja (lo que se dibuja) o un subcircuito.
 * En el original, `LogicalCircuit`.
 *
 * `elements` es **lo que el fichero guarda** de esa hoja: mezcla símbolos colocados y
 * cables, en el orden en que se crearon. Aquí conviven las dos cosas en una sola lista
 * porque el original hace lo mismo: cada `CircuitSymbol` y cada `Wire` es una fila más del
 * mismo documento, y el orden de las filas es lo que numera los pines de un repartidor.
 */
export interface Circuit {
  readonly id: Id
  readonly name: string
  readonly elements: readonly StoredElement[]
  /**
   * Forma con la que se dibuja un subcircuito cuando se coloca (original:
   * `LogicalCircuit.CircuitShape`). `Rectangular` es el valor por defecto del original.
   */
  readonly shape?: CircuitShape
  /**
   * Le da la vuelta a la forma (original: `LogicalCircuit.InvertIsDisplay`): con él, un
   * circuito rectangular se dibuja como pantalla y al revés.
   */
  readonly invertedIsDisplay?: boolean
}

/**
 * Lo que puede haber guardado en una hoja: un símbolo colocado o un cable.
 *
 * Es más ancho que `Element` (lo que el editor sabe colocar hoy) y eso es a propósito:
 * el modelo no debe tener que esperar al editor para existir.
 */
export type StoredElement = PlacedElement | Wire

/** Un proyecto completo: lo que se guarda en un fichero `.CircuitProject`. */
export interface Project {
  readonly id: Id
  readonly name: string
  readonly circuits: readonly Circuit[]
  /** Circuito que se abre al cargar. */
  readonly mainCircuitId: Id
}
