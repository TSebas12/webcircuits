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
 *   - `CircuitProject/Gate.cs` → `CircuitSymbolWidth/Height`, `GeneratePins` y compañía
 *   - `CircuitProject/LogicalCircuit.cs` → `CircuitSymbolWidth/Height`
 *   - `CircuitProject/Splitter.cs` → `CreatePins`
 *   - `CircuitProject/Pin.cs` → el pin de hoja y su `DevicePin`
 *
 * ⚠️ Los pines **no se guardan**: se deducen de la forma del símbolo. En el original sí
 * son objetos del modelo (y viajan en el XML), pero recalcularlos es más simple y no
 * puede desincronizarse. Si en M4 el fichero exige guardarlos, se guardan al exportar.
 *
 * ⚠️ **El orden de `SymbolLayout.pins` es el de creación de los pines del original**
 * (`DevicePin.Order`), agrupado por lados —izquierda, arriba, derecha, abajo—, que es
 * exactamente el orden en que los enumera `CircuitGlyph.Jams()`. Hay código que depende de
 * él: `Splitter.Pass` numera los bits por ese orden. No reordenar «para que quede bonito».
 */

import type {
  Circuit,
  Constant,
  GateType,
  GridPoint,
  GridRect,
  Id,
  Pin,
  PinSide,
  PinType,
  PlacedElement,
  Rotation,
  Splitter,
} from './types'

/** Número máximo de entradas de una compuerta (original: `Gate.MaxInputCount`). */
export const MAX_GATE_INPUTS = 18

/** Ancho de una compuerta normal, en unidades de rejilla. */
const GATE_WIDTH = 3

/** Alto mínimo de una compuerta (original: `Gate.CircuitSymbolHeight` → `max(4, alto)`). */
const GATE_MIN_HEIGHT = 4

/** Ancho/alto mínimo de un símbolo cualquiera (original: `Circuit.CircuitSymbolWidth`). */
const MIN_SYMBOL_SIZE = 2

/** Lado mínimo de un subcircuito (original: `LogicalCircuit.CircuitSymbolWidth`). */
const MIN_CIRCUIT_WIDTH = 3

/** Alto mínimo de un subcircuito (original: `LogicalCircuit.CircuitSymbolHeight`). */
const MIN_CIRCUIT_HEIGHT = 4

/**
 * La descripción de un pin, antes de saber dónde cae.
 *
 * Es la parte de `BasePin` que hace falta para dibujar y para simular: de qué lado está,
 * si es entrada o salida, cuántos bits lleva y si está negado.
 */
export interface PinSpec {
  readonly side: PinSide
  readonly type: PinType
  readonly bitWidth: number
  readonly inverted: boolean
}

/** Un pin, en coordenadas **locales** a la caja del símbolo. */
export interface PinLayout extends PinSpec {
  readonly point: GridPoint
  /**
   * Su número de creación (original: `DevicePin.Order`).
   *
   * ⚠️ **No siempre coincide con el orden por lados.** `Jams()` enumera por lados
   * —izquierda, arriba, derecha, abajo—, pero el original ordena las puntas por este
   * número cuando le hace falta (`JamComparer`), y hay código que depende de ello: el
   * tri-estado lee `jam[0]` como dato y `jam[1]` como habilitación, y `Splitter.Pass` da
   * por hecho que el pin ancho se creó el primero.
   */
  readonly order: number
}

/** La forma de un símbolo: cuánto ocupa y dónde tiene los pines. */
export interface SymbolLayout {
  readonly width: number
  readonly height: number
  readonly pins: readonly PinLayout[]
}

/** Los lados, en el orden en que el original enumera los pines (`CircuitGlyph.Jams`). */
const SIDES: readonly PinSide[] = ['left', 'top', 'right', 'bottom']

/** Cuántos pines hay en cada lado. */
function sideCounts(specs: readonly PinSpec[]): Record<PinSide, number> {
  const counts: Record<PinSide, number> = { left: 0, top: 0, right: 0, bottom: 0 }
  for (const spec of specs) {
    counts[spec.side] += 1
  }
  return counts
}

/**
 * El tamaño que sale de la cuenta de pines (original: `Circuit.Update`).
 *
 * Ancho = `max(arriba, abajo) + 1` y alto = `max(izquierda, derecha) + 1`. Cada tipo
 * ajusta luego ese mínimo a su manera.
 */
export function defaultSymbolSize(specs: readonly PinSpec[]): {
  readonly width: number
  readonly height: number
} {
  const counts = sideCounts(specs)
  return {
    width: Math.max(counts.top, counts.bottom) + 1,
    height: Math.max(counts.left, counts.right) + 1,
  }
}

/**
 * Reparte los pines y los coloca (original: `Circuit.Update` + `Circuit.UpdatePin`).
 *
 * Dos pasos, y el orden importa:
 *
 * 1. **Por lados.** Los pines se agrupan por lado y, dentro de cada lado, se reparten con
 *    `paso = (lado - 2) / (cuántos - 1)`, con **división entera**, como en C#. Con uno
 *    solo, va al punto medio (`lado / 2`, también entero). Por eso una AND de 2 entradas de
 *    alto 4 los tiene en y = 1 y y = 3, y no en 1,33 y 2,66.
 * 2. **En el orden del original.** Las puntas salen agrupadas por lado —izquierda, arriba,
 *    derecha, abajo—, que es como las enumera `CircuitGlyph.Jams()`. El número de creación
 *    viaja en cada una para quien necesite el otro orden (`JamComparer`).
 */
function symbolLayout(
  specs: readonly PinSpec[],
  size: { readonly width: number; readonly height: number },
): SymbolLayout {
  const bySide = new Map<PinSide, { readonly spec: PinSpec; readonly order: number }[]>()
  for (const side of SIDES) {
    bySide.set(side, [])
  }
  specs.forEach((spec, order) => {
    bySide.get(spec.side)!.push({ spec, order })
  })

  const point = (side: PinSide, offset: number): GridPoint => {
    switch (side) {
      case 'left':
        return { x: 0, y: offset }
      case 'top':
        return { x: offset, y: 0 }
      case 'right':
        return { x: size.width, y: offset }
      case 'bottom':
        return { x: offset, y: size.height }
    }
  }

  const pins: PinLayout[] = []
  for (const side of SIDES) {
    const list = bySide.get(side)!
    const sideSize = side === 'left' || side === 'right' ? size.height : size.width
    list.forEach((entry, index) => {
      const offset =
        list.length === 1
          ? Math.floor(sideSize / 2)
          : index * Math.trunc((sideSize - 2) / (list.length - 1)) + 1
      pins.push({ ...entry.spec, order: entry.order, point: point(side, offset) })
    })
  }
  return { width: size.width, height: size.height, pins }
}

/** Ajusta el número de entradas al rango que admite el original. */
export function clampGateInputs(inputCount: number): number {
  return Math.min(MAX_GATE_INPUTS, Math.max(1, Math.trunc(inputCount)))
}

function inputPin(side: PinSide = 'left', bitWidth = 1): PinSpec {
  return { side, type: 'input', bitWidth: Math.max(1, Math.trunc(bitWidth)), inverted: false }
}

function outputPin(inverted = false, bitWidth = 1): PinSpec {
  return { side: 'right', type: 'output', bitWidth: Math.max(1, Math.trunc(bitWidth)), inverted }
}

/**
 * Los pines de una compuerta, **en el orden en que los crea el original**.
 *
 * Portado de `Gate.GeneratePins`, `GenerateTriStatePins` y
 * `GenerateSevenSegmentIndicatorPins`. El orden no es un capricho: el tri-estado coloca
 * primero la entrada de datos, luego la de habilitación y por último la salida, y
 * `DefineTriState` lee `jam[0]`, `jam[1]` y `jam[2]` en ese orden.
 */
function gatePinSpecs(gateType: GateType, inputCount: number, invertedOutput: boolean, bitWidth = 1): PinSpec[] {
  const width = Math.max(1, Math.trunc(bitWidth))
  switch (gateType) {
    case 'not':
      return [inputPin('left', width), outputPin(invertedOutput, width)]

    case 'and':
    case 'or':
    case 'xor': {
      const count = clampGateInputs(inputCount)
      const specs: PinSpec[] = []
      for (let index = 0; index < count; index += 1) {
        specs.push(inputPin('left', width))
      }
      specs.push(outputPin(invertedOutput, width))
      return specs
    }

    case 'clock':
      // Sin entradas: solo la salida. Es la única compuerta así.
      return [outputPin()]

    case 'led':
      if (inputCount === 8) {
        // Siete segmentos: 4 segmentos a la izquierda y 3 más el punto a la derecha.
        return [
          inputPin(),
          inputPin(),
          inputPin(),
          inputPin(),
          inputPin('right'),
          inputPin('right'),
          inputPin('right'),
          inputPin('right'),
        ]
      }
      // Un LED: una entrada y ninguna salida.
      return [inputPin()]

    case 'triState1':
      // La habilitación asoma por abajo (el tri-estado «1» la mira desde el sur).
      return [inputPin(), inputPin('bottom'), outputPin()]

    case 'triState2':
      return [inputPin(), inputPin('top'), outputPin()]

    case 'nop':
    case 'odd':
    case 'even':
      throw new Error(`gatePinSpecs(): «${gateType}» no es una compuerta que se pueda colocar`)
  }
}

/** El tamaño de una compuerta (original: `Gate.CircuitSymbolWidth/Height`). */
function gateSize(
  gateType: GateType,
  specs: readonly PinSpec[],
): { readonly width: number; readonly height: number } {
  const base = defaultSymbolSize(specs)

  // El reloj y el LED de una sola entrada se quedan con el tamaño mínimo; el resto de las
  // compuertas ocupan 3 de ancho y 4 de alto como poco.
  const minimal = gateType === 'clock' || (gateType === 'led' && specs.length === 1)
  if (minimal) {
    return {
      width: Math.max(MIN_SYMBOL_SIZE, base.width),
      height: Math.max(MIN_SYMBOL_SIZE, base.height),
    }
  }
  return { width: GATE_WIDTH, height: Math.max(GATE_MIN_HEIGHT, base.height) }
}

/**
 * La forma de una compuerta.
 *
 * Reglas del original (`Gate.cs`): las compuertas ocupan 3 unidades de ancho y
 * `max(4, entradas + 1)` de alto. La excepción son el reloj y el LED de una entrada, que
 * miden 2 × 2 porque no tienen entradas (el reloj) o no tienen salida (el LED).
 */
export function gateLayout(
  gateType: GateType,
  inputCount: number,
  invertedOutput = false,
  bitWidth = 1,
): SymbolLayout {
  const specs = gatePinSpecs(gateType, inputCount, invertedOutput, bitWidth)
  return symbolLayout(specs, gateSize(gateType, specs))
}

/**
 * La forma de una probeta (original: `CircuitProbe` + `SymbolShape.Probe`).
 *
 * Mide 2 × 2 y tiene **una sola entrada**, en el lado que diga el modelo. El original
 * dibuja una pastilla con el valor dentro; aquí la pastilla lleva un indicador que el
 * render pinta con el estado del cable, y el historial se ve en el osciloscopio.
 */
export function probeLayout(pinSide: PinSide): SymbolLayout {
  const specs: PinSpec[] = [inputPin(pinSide)]
  const base = defaultSymbolSize(specs)
  return symbolLayout(specs, {
    width: Math.max(MIN_SYMBOL_SIZE, base.width),
    height: Math.max(MIN_SYMBOL_SIZE, base.height),
  })
}

/** La forma de una memoria (original: `Memory`, caja con dirección a la izquierda y datos a la derecha). */
export function memoryLayout(addressBitWidth: number, dataBitWidth: number): SymbolLayout {
  const addr = Math.max(1, Math.trunc(addressBitWidth))
  const data = Math.max(1, Math.trunc(dataBitWidth))
  const specs: PinSpec[] = [
    { side: 'left', type: 'input', bitWidth: addr, inverted: false },
    { side: 'right', type: 'output', bitWidth: data, inverted: false },
  ]
  const base = defaultSymbolSize(specs)
  return symbolLayout(specs, {
    width: Math.max(4, base.width),
    height: Math.max(3, base.height),
  })
}

/** La forma de un sensor (original: `Sensor`, 4×3 con una única salida). */
export function sensorLayout(pinSide: PinSide, bitWidth = 1): SymbolLayout {
  const specs: PinSpec[] = [
    { side: pinSide, type: 'output', bitWidth: Math.max(1, Math.trunc(bitWidth)), inverted: false },
  ]
  return symbolLayout(specs, { width: 4, height: 3 })
}

/**
 * La forma de un interruptor de entrada.
 *
 * 2×2, sin entradas y con **un pin de salida a la derecha**, en (2, 1).
 *
 * ⚠️ El original permite mover ese pin a los otros lados (`PinSide`); eso llega en M2.
 */
export function buttonLayout(inverted = false): SymbolLayout {
  const specs: PinSpec[] = [outputPin(inverted)]
  const base = defaultSymbolSize(specs)
  return symbolLayout(specs, {
    width: Math.max(MIN_SYMBOL_SIZE, base.width),
    height: Math.max(MIN_SYMBOL_SIZE, base.height),
  })
}

/**
 * La forma de un **pin de hoja** (original: `Pin` + el `DevicePin` que le crea `PinSet`).
 *
 * Es 2 × 2 y su única punta asoma por el lado **contrario** al que ocupa en la caja del
 * circuito: un pin de entrada se dibuja a la izquierda de la hoja y su punta está a la
 * derecha del cuadradito (tira hacia dentro), y un pin de salida al revés. Sale de
 * `DevicePin.Create`, que le da la vuelta al lado del `Pin`:
 *
 * ```csharp
 * PinSide pinSide = BasePin.DefaultSide((circuit is Pin p) ? (p.PinType == Input ? Output : Input) : pinType);
 * pinSide = BasePin.DefaultSide((p.PinType == Input) ? Output : Input);
 * ```
 */
export function pinLayout(pin: {
  readonly pinType: PinType
  readonly bitWidth: number
  readonly inverted: boolean
}): SymbolLayout {
  const side: PinSide = pin.pinType === 'input' ? 'right' : 'left'
  const specs: PinSpec[] = [
    { side, type: 'none', bitWidth: pin.bitWidth, inverted: pin.inverted },
  ]
  const base = defaultSymbolSize(specs)
  return symbolLayout(specs, {
    width: Math.max(MIN_SYMBOL_SIZE, base.width),
    height: Math.max(MIN_SYMBOL_SIZE, base.height),
  })
}

/**
 * La forma de un repartidor de bits (original: `Splitter.CreatePins`).
 *
 * Ocupa **una** unidad de ancho. El pin ancho va de un lado y los finos del otro, y el
 * reparto no es a partes iguales: los `ancho % cuántos` primeros pines finos se llevan un
 * bit de más. De ese reparto sale a qué bit corresponde cada cable, así que el orden de
 * creación importa tanto como en las compuertas.
 */
export function splitterLayout(splitter: Splitter): SymbolLayout {
  const pinCount = Math.max(2, splitter.pinCount)
  const bitWidth = Math.max(pinCount, splitter.bitWidth)
  const wideSide: PinSide = splitter.clockwise ? 'left' : 'right'
  const thinSide: PinSide = splitter.clockwise ? 'right' : 'left'

  const specs: PinSpec[] = [
    { side: wideSide, type: 'none', bitWidth, inverted: false },
  ]
  const thinWidth = Math.trunc(bitWidth / pinCount)
  const remainder = bitWidth % pinCount
  for (let index = 0; index < remainder; index += 1) {
    specs.push({ side: thinSide, type: 'none', bitWidth: thinWidth + 1, inverted: false })
  }
  for (let index = remainder; index < pinCount; index += 1) {
    specs.push({ side: thinSide, type: 'none', bitWidth: thinWidth, inverted: false })
  }

  const base = defaultSymbolSize(specs)
  return symbolLayout(specs, { width: 1, height: Math.max(MIN_SYMBOL_SIZE, base.height) })
}

/**
 * La forma de una **constante** (original: `Constant.CircuitSymbolWidth/Height` +
 * `BasePin`). Es una cajita 2×2 con una única salida asomando por el lado que diga
 * `pinSide`.
 */
export function constantLayout(constant: Constant): SymbolLayout {
  const specs: PinSpec[] = [
    { side: constant.pinSide, type: 'output', bitWidth: Math.max(1, constant.bitWidth), inverted: false },
  ]
  const base = defaultSymbolSize(specs)
  return symbolLayout(specs, {
    width: Math.max(MIN_SYMBOL_SIZE, base.width),
    height: Math.max(MIN_SYMBOL_SIZE, base.height),
  })
}

/**
 * La forma con la que se dibuja un **subcircuito** cuando se coloca (original:
 * `LogicalCircuit.CircuitSymbolWidth/Height`).
 *
 * Sus pines son los pines de la hoja que representa, cada uno con su lado. Todos son
 * `none` para la simulación (ver `Jam.effectivePinType`), porque desde fuera un pin de
 * hoja no es ni entrada ni salida: es un pasamanos.
 *
 * ⚠️ Falta el caso de las **pantallas** (`CircuitShape.Display`): cuando un circuito es una
 * pantalla, su caja se estira hasta el rectángulo que ocupan sus indicadores
 * (`LogicalCircuit.DisplayBounds`). Eso necesita el dibujado de los indicadores, que es
 * M2/M6.
 */
export function circuitSymbolLayout(pins: readonly PinSpec[]): SymbolLayout {
  const base = defaultSymbolSize(pins)
  return symbolLayout(pins, {
    width: Math.max(MIN_CIRCUIT_WIDTH, base.width),
    height: Math.max(MIN_CIRCUIT_HEIGHT, base.height),
  })
}

/**
 * Una forma vacía: 2×2 y sin pines.
 *
 * Es el respaldo para los dispositivos que el editor todavía no sabe dibujar (memorias,
 * sensores, notas…). Así las cuentas de caja y de clic no revientan con ellos, aunque no se
 * pinten; el día que tengan símbolo propio, se cambia aquí y aparece en todas partes.
 */
const EMPTY_LAYOUT: SymbolLayout = {
  width: MIN_SYMBOL_SIZE,
  height: MIN_SYMBOL_SIZE,
  pins: [],
}

/**
 * Cómo encontrar el circuito que representa una instancia.
 *
 * Se pasa como función para que `layout.ts` siga sin depender de `CircuitProject`: el modelo
 * solo necesita saber «dame este circuito», no quién se lo guarda.
 */
export type CircuitResolver = (id: Id) => Circuit | undefined

/**
 * La forma de un dispositivo colocado.
 *
 * Es la traducción de `Circuit.SymbolWidth/Height` del original: cada símbolo sabe cuánto
 * mide y dónde tiene sus pines, y todo lo demás (cables, clic, simulación) se apoya en
 * esto en vez de repetir las cuentas.
 *
 * Un **subcircuito** necesita saber a qué circuito representa para conocer sus pines; por eso
 * `resolveCircuit` es opcional: donde no haya proyecto a mano (por ejemplo, al girar desde el
 * modelo) se cae a la caja vacía.
 */
export function deviceLayout(
  device: PlacedElement,
  resolveCircuit?: CircuitResolver,
): SymbolLayout {
  switch (device.kind) {
    case 'gate':
      return gateLayout(device.gateType, device.inputCount, device.invertedOutput, device.bitWidth ?? 1)
    case 'probe':
      return probeLayout(device.pinSide)
    case 'sensor':
      return sensorLayout(device.pinSide, device.bitWidth)
    case 'memory':
      return memoryLayout(device.addressBitWidth, device.dataBitWidth)
    case 'button':
      return buttonLayout(device.inverted)
    case 'pin':
      return placedPinLayout(device) ?? EMPTY_LAYOUT
    case 'constant':
      return constantLayout(device)
    case 'splitter':
      return splitterLayout(device)
    case 'circuit': {
      const circuit = resolveCircuit?.(device.targetCircuitId)
      return circuit ? circuitInstanceLayout(circuit) : EMPTY_LAYOUT
    }
    default:
      return EMPTY_LAYOUT
  }
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

export function placedPins(
  device: PlacedElement,
  resolveCircuit?: CircuitResolver,
): PlacedPin[] {
  const layout = deviceLayout(device, resolveCircuit)
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
export function deviceBounds(
  device: PlacedElement,
  resolveCircuit?: CircuitResolver,
): GridRect {
  const layout = deviceLayout(device, resolveCircuit)
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
 * Centro de rotación, en unidades de rejilla (original: `Symbol.RotationCenter`).
 *
 * Si el ancho y el alto tienen la **misma paridad**, el centro es el geométrico. Si no,
 * el original lo baja a la rejilla con **división entera** — de modo que el centro deja
 * de ser el centro. Es raro, pero es lo que hay: cambiarlo movería los pines de todas las
 * compuertas rotadas.
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

/**
 * La forma del símbolo de un pin de hoja colocado.
 *
 * Devuelve `undefined` si el pin no es colocable (un pin «ninguno» no existe en el
 * original: `PinSet.Create` solo crea entrada o salida).
 */
export function placedPinLayout(pin: Pin): SymbolLayout | undefined {
  if (pin.pinType === 'none') {
    return undefined
  }
  return pinLayout(pin)
}

/**
 * La forma de un subcircuito colocado.
 *
 * Necesita el circuito que representa para saber qué pines tiene.
 */
export function circuitInstanceLayout(circuit: Circuit): SymbolLayout {
  return circuitSymbolLayout(sheetPinSpecs(circuit))
}

/**
 * Los pines de una hoja, en el orden en que el original los numera.
 *
 * Portado de `PinComparer.cs`: primero el `Index` del pin —que aquí no existe y vale
 * siempre 0, porque el fichero tampoco lo guarda—, luego la `Y` de su símbolo, luego la
 * `X` y, si empatan, el nombre por orden de código de carácter (`StringComparer.Ordinal`).
 *
 * ⚠️ Esto **no** es el orden del fichero: es el orden que decide en qué fila cae cada pin
 * de un lado de la caja (original: `Circuit.Update`, que ordena cada lado con este mismo
 * comparador antes de repartirlos). Dos pines del mismo lado con las X e Y intercambiadas
 * caen en filas distintas, y el circuito simulado sería otro.
 */
function pinSortKey(a: Pin, b: Pin): number {
  if (a.position.y !== b.position.y) {
    return a.position.y - b.position.y
  }
  if (a.position.x !== b.position.x) {
    return a.position.x - b.position.x
  }
  if (a.name === b.name) {
    return 0
  }
  return a.name < b.name ? -1 : 1
}

/** Los pines de una hoja, ordenados como los ordena el original. */
export function sortedSheetPins(circuit: Circuit): Pin[] {
  return circuit.elements
    .filter((element): element is Pin => element.kind === 'pin' && element.pinType !== 'none')
    .sort(pinSortKey)
}

/** Los pines de una hoja, como especificaciones listas para colocar. */
export function sheetPinSpecs(circuit: Circuit): PinSpec[] {
  return sortedSheetPins(circuit).map((pin) => ({
    side: pin.side,
    type: 'none' as PinType,
    bitWidth: pin.bitWidth,
    inverted: pin.inverted,
  }))
}

/**
 * Los pines de una hoja en el **orden del fichero** (el de creación).
 *
 * Es el orden que hace falta para el mapa de simulación: los pines de un subcircuito se
 * emparejan por posición con los del circuito que representan, y ahí manda el orden en que
 * se guardaron, no el de la rejilla. `sheetPinSpecs` da el otro (el de la rejilla), que es
 * el que decide dónde cae cada pin.
 */
export function sheetPinsInStoredOrder(circuit: Circuit): Pin[] {
  return circuit.elements.filter(
    (element): element is Pin => element.kind === 'pin' && element.pinType !== 'none',
  )
}

