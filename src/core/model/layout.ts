/**
 * Medidas y pines de los símbolos, en unidades de rejilla.
 *
 * **Esto es modelo, no dibujo.** El tamaño de un símbolo decide dónde caen sus pines, y
 * de ahí dependen los cables, la detección de clic y la simulación. Por eso vive en
 * `core/` y no en `render/`: es semántica, no estética.
 *
 * Portado de:
 *   - `CircuitProject/Symbol.cs` → `RotationCenter`, `Angle`
 *   - `CircuitProject/Circuit.cs` líneas 90-144 → `Update` y `UpdatePin`
 *   - `CircuitProject/Gate.cs` → `CircuitSymbolWidth/Height`
 *
 * ⚠️ Los pines **no se guardan**: se deducen de la forma del símbolo. En el original sí
 * son objetos del modelo (y viajan en el XML), pero recalcularlos es más simple y no
 * puede desincronizarse. Si en M4 el fichero exige guardarlos, se guardan al exportar.
 */

import type {
  Button,
  Gate,
  GateType,
  GridPoint,
  GridRect,
  PinSide,
  PinType,
  Rotation,
} from './types'

/** Número máximo de entradas de una compuerta (original: `Gate.MaxInputCount`). */
export const MAX_GATE_INPUTS = 18

/** Ancho de una compuerta normal, en unidades de rejilla. */
const GATE_WIDTH = 3

/** Alto mínimo de una compuerta (original: `Gate.CircuitSymbolHeight` → `max(4, alto)`). */
const GATE_MIN_HEIGHT = 4

/** Alto mínimo de un símbolo cualquiera (original: `Circuit.CircuitSymbolHeight`). */
const MIN_SYMBOL_SIZE = 2

/** Un pin, en coordenadas **locales** a la caja del símbolo. */
export interface PinLayout {
  readonly side: PinSide
  readonly type: PinType
  readonly point: GridPoint
}

/** La forma de un símbolo: cuánto ocupa y dónde tiene los pines. */
export interface SymbolLayout {
  readonly width: number
  readonly height: number
  readonly pins: readonly PinLayout[]
}

/**
 * Reparte los pines a lo largo de un lado.
 *
 * Portado literal de `Circuit.UpdatePin`. El detalle que importa: cuando hay más de uno,
 * `d = (lado - 2) / (cuántos - 1)` se calcula con **división entera**, como en C#. Con 1
 * solo pin, se coloca en el punto medio (`lado / 2`, también entero).
 */
function placePins(
  side: PinSide,
  type: PinType,
  count: number,
  sideSize: number,
  point: (offset: number) => GridPoint,
): PinLayout[] {
  if (count <= 0) {
    return []
  }
  if (count === 1) {
    return [{ side, type, point: point(Math.floor(sideSize / 2)) }]
  }
  const step = Math.trunc((sideSize - 2) / (count - 1))
  const pins: PinLayout[] = []
  for (let index = 0; index < count; index += 1) {
    pins.push({ side, type, point: point(index * step + 1) })
  }
  return pins
}

/** Un símbolo con las entradas a la izquierda y (opcionalmente) la salida a la derecha. */
function horizontalLayout(
  width: number,
  height: number,
  inputCount: number,
  withOutput: boolean,
): SymbolLayout {
  const pins: PinLayout[] = [
    ...placePins('left', 'input', inputCount, height, (y) => ({ x: 0, y })),
  ]
  if (withOutput) {
    pins.push(...placePins('right', 'output', 1, height, (y) => ({ x: width, y })))
  }
  return { width, height, pins }
}

/** Ajusta el número de entradas al rango que admite el original. */
export function clampGateInputs(inputCount: number): number {
  return Math.min(MAX_GATE_INPUTS, Math.max(1, Math.trunc(inputCount)))
}

/**
 * La forma de una compuerta.
 *
 * Reglas del original (`Gate.cs`): las compuertas ocupan 3 unidades de ancho y
 * `max(4, entradas + 1)` de alto. El LED es la excepción: mide 2 × 2 porque no tiene
 * salida.
 */
export function gateLayout(gateType: GateType, inputCount: number): SymbolLayout {
  switch (gateType) {
    case 'not':
      return horizontalLayout(GATE_WIDTH, GATE_MIN_HEIGHT, 1, true)

    case 'and':
    case 'or':
    case 'xor': {
      const inputs = clampGateInputs(inputCount)
      const height = Math.max(GATE_MIN_HEIGHT, inputs + 1)
      return horizontalLayout(GATE_WIDTH, height, inputs, true)
    }

    case 'led':
      // 1 entrada, sin salida. El original calcula 2 × 2 para el tamaño por defecto.
      return horizontalLayout(MIN_SYMBOL_SIZE, MIN_SYMBOL_SIZE, 1, false)

    case 'nop':
    case 'clock':
    case 'triState1':
    case 'triState2':
    case 'odd':
    case 'even':
    case 'probe':
      throw new Error(`gateLayout(): «${gateType}» todavía no está implementado`)
  }
}

/**
 * La forma de un interruptor de entrada.
 *
 * 2×2, sin entradas y con **un pin de salida a la derecha**, en (2, 1) — que es lo que
 * sale de aplicar la regla del original al botón por defecto.
 *
 * ⚠️ El original permite mover ese pin a los otros lados (`PinSide`); eso llega en M2.
 */
export function buttonLayout(): SymbolLayout {
  return horizontalLayout(MIN_SYMBOL_SIZE, MIN_SYMBOL_SIZE, 0, true)
}

/**
 * Centro de rotación, en unidades de rejilla (original: `Symbol.RotationCenter`).
 *
 * Si el ancho y el alto tienen la **misma paridad**, el centro es el geométrico. Si no,
 * el original lo baja a la rejilla con **división entera** — de modo que el centro deja
 * de ser el centro. Es raro, pero es lo que hay: cambiarlo movería los pines de todas
 * las compuertas rotadas.
 */
export function rotationCenter(width: number, height: number): GridPoint {
  if ((width & 1) === (height & 1)) {
    return { x: width / 2, y: height / 2 }
  }
  return { x: Math.trunc(width / 2), y: Math.trunc(height / 2) }
}

/** El ángulo del original (original: `Symbol.Angle`). */
export function rotationAngle(rotation: Rotation): number {
  switch (rotation) {
    case 'up':
      return 0
    case 'right':
      return 90
    case 'down':
      return 180
    case 'left':
      return -90
  }
}

/**
 * Gira un punto local alrededor del centro de rotación.
 *
 * Se calcula con las cuatro orientaciones exactas en vez de con senos y cosenos: así los
 * giros de 90° dan números **enteros exactos** y no aparecen pines en 2,9999999.
 */
export function rotatePoint(
  point: GridPoint,
  rotation: Rotation,
  width: number,
  height: number,
): GridPoint {
  if (rotation === 'up') {
    return point
  }
  const center = rotationCenter(width, height)
  const dx = point.x - center.x
  const dy = point.y - center.y

  switch (rotation) {
    case 'right':
      return { x: center.x - dy, y: center.y + dx }
    case 'down':
      return { x: center.x - dx, y: center.y - dy }
    case 'left':
      return { x: center.x + dy, y: center.y - dx }
  }
}

/**
 * La forma de un dispositivo colocado, en coordenadas locales.
 *
 * Es la traducción de `Circuit.SymbolWidth/Height` del original: cada símbolo sabe cuánto
 * mide y dónde tiene sus pines, y todo lo demás (cables, clic, simulación) se apoya en
 * esto en vez de repetir las cuentas.
 */
export function deviceLayout(device: Gate | Button): SymbolLayout {
  return device.kind === 'gate' ? gateLayout(device.gateType, device.inputCount) : buttonLayout()
}

/**
 * Los pines de un dispositivo con su posición ya resuelta en la rejilla.
 *
 * Se calcula al vuelo en vez de guardarse: un pin no puede desincronizarse de su símbolo
 * porque no hay nada que sincronizar.
 */
export interface PlacedPin {
  readonly pin: PinLayout
  /** Posición absoluta en la rejilla. */
  readonly point: GridPoint
}

export function placedPins(device: Gate | Button): PlacedPin[] {
  const layout = deviceLayout(device)
  return layout.pins.map((pin) => ({
    pin,
    point: pinPosition(device.position, device.rotation, layout, pin),
  }))
}

/**
 * La caja que ocupa un dispositivo, ya teniendo en cuenta el giro.
 *
 * Hace falta porque al girar el símbolo su caja deja de ser `(0,0)-(ancho,alto)`: con un
 * giro de 180° se sale a coordenadas negativas. Se gira cada esquina con la misma regla
 * que los pines y se toma el rectángulo que las contiene.
 */
export function deviceBounds(device: Gate | Button): GridRect {
  const layout = deviceLayout(device)
  const corners: readonly GridPoint[] = [
    { x: 0, y: 0 },
    { x: layout.width, y: 0 },
    { x: layout.width, y: layout.height },
    { x: 0, y: layout.height },
  ]

  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const corner of corners) {
    const turned = rotatePoint(corner, device.rotation, layout.width, layout.height)
    x0 = Math.min(x0, turned.x)
    y0 = Math.min(y0, turned.y)
    x1 = Math.max(x1, turned.x)
    y1 = Math.max(y1, turned.y)
  }

  return {
    x0: device.position.x + x0,
    y0: device.position.y + y0,
    x1: device.position.x + x1,
    y1: device.position.y + y1,
  }
}

/**
 * Posición absoluta en la rejilla de un pin de un dispositivo.
 *
 * ⚠️ Ojo al girar: el original recoloca el símbolo al rotar para que no se mueva de
 * sitio, porque la caja girada puede salirse a coordenadas negativas. Ese recolocado es
 * cosa del editor (M2); aquí se da la posición matemática.
 */
export function pinPosition(
  position: GridPoint,
  rotation: Rotation,
  layout: SymbolLayout,
  pin: PinLayout,
): GridPoint {
  const local = rotatePoint(pin.point, rotation, layout.width, layout.height)
  return { x: position.x + local.x, y: position.y + local.y }
}
