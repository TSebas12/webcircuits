/**
 * Los símbolos colocados y sus **puntas** (lo que el original llama `CircuitSymbol` y
 * `Jam`).
 *
 * Ésta es la pieza que le faltaba al modelo para poder simular de verdad. En el original,
 * un circuito no es una lista de piezas: es un **árbol** de `CircuitSymbol`s, cada uno de
 * los cuales representa un `Circuit` (una compuerta, un pin de hoja, un subcircuito…) y
 * expone sus pines como `Jam`, que son puntos de la rejilla con un tipo y un ancho.
 * `CircuitMap` (M2-07) se construye entero sobre esto.
 *
 * Aquí se reproduce esa vista **sin copiar la jerarquía de clases del original**: el
 * modelo guarda los elementos planos (una compuerta es un elemento con posición, no un
 * `Circuit` con un `CircuitSymbol` encima), y este módulo los presenta como símbolos con
 * puntas. La diferencia se nota en un solo sitio y no cambia nada observable: en el
 * original dos compuertas AND idénticas **comparten** el mismo objeto `Gate` —está en un
 * diccionario con `Guid` calculado—, y aquí son dos objetos distintos. Da igual: lo que
 * viaja por el circuito son los índices de estado de cada colocación, no la compuerta.
 *
 * Portado de:
 *   - `CircuitProject/CircuitGlyph.cs` → `Jams()`, `Jam(pin)`, `CreateJam`
 *   - `CircuitProject/Jam.cs` → `AbsolutePoint`, `EffectivePinType`, `IsValid`, `InnerJam`
 *   - `CircuitProject/CircuitSymbol.cs` → el símbolo colocado
 *   - `CircuitProject/ConductorMap.cs` → el mapa de conductores (vía `conductor.ts`)
 *
 * ⚠️ **Las puntas se identifican por objeto, no por valor.** `Jam` es una clase con
 * identidad (como en C#), porque hay código que compara `enterJam == list[0]`
 * (`Splitter.Pass`). Por eso los símbolos se fabrican una sola vez con `SymbolIndex` y se
 * reutilizan; si cada llamada creara objetos nuevos, las comparaciones fallarían en
 * silencio.
 */

import {
  buttonLayout,
  circuitInstanceLayout,
  circuitSymbolLayout,
  constantLayout,
  deviceLayout,
  pinLayout,
  pinPosition,
  sheetPinSpecs,
  sortedSheetPins,
  splitterLayout,
  type PinLayout,
  type SymbolLayout,
} from './layout'
import { ConductorMap } from './conductor'
import type {
  Button,
  Circuit,
  Constant,
  Gate,
  GraphicsArray,
  GridPoint,
  Id,
  LedMatrix,
  Memory,
  Pin,
  PinType,
  PlacedElement,
  Probe,
  Project,
  Rotation,
  Sensor,
  Sound,
  Splitter,
  Wire,
} from './types'

/**
 * Los dispositivos que el original considera **primitivos**: los que sabe construir el
 * mapa de simulación sin bajar más (`CircuitMap.IsPrimitive`).
 *
 * Un pin de hoja y un subcircuito **no** lo son: hay que atravesarlos. Y un repartidor
 * tampoco: se salta, no se simula.
 */
export type PrimitiveDevice = Constant | Probe | Memory | LedMatrix | Sensor | Sound | GraphicsArray

/** Qué representa un símbolo colocado: su `Circuit`, en el vocabulario del original. */
export type DepictedCircuit =
  | { readonly kind: 'gate'; readonly element: Gate }
  | { readonly kind: 'button'; readonly element: Button }
  | { readonly kind: 'pin'; readonly element: Pin }
  | { readonly kind: 'splitter'; readonly element: Splitter }
  | { readonly kind: 'subcircuit'; readonly circuit: Circuit }
  | { readonly kind: 'device'; readonly element: PrimitiveDevice }

/** ¿Este símbolo se simula directamente, sin bajar a su interior? */
export function isPrimitive(depicted: DepictedCircuit): boolean {
  switch (depicted.kind) {
    case 'gate':
    case 'button':
    case 'device':
      return true
    case 'pin':
    case 'splitter':
    case 'subcircuit':
      return false
  }
}

/** El identificador del circuito que representa un símbolo (para `SymbolMapKey`). */
export function depictedId(depicted: DepictedCircuit): Id {
  switch (depicted.kind) {
    case 'subcircuit':
      return depicted.circuit.id
    default:
      return depicted.element.id
  }
}

/**
 * Un pin, tal como lo ve el mapa de simulación (original: `BasePin`).
 *
 * Todos los pines de un símbolo son `none` para la simulación salvo los de un dispositivo
 * primitivo: los de un pin de hoja y los de un subcircuito son **pasamanos**, porque
 * desde fuera no se sabe —ni hace falta— si el de dentro es entrada o salida. Eso lo
 * decide el circuito de dentro al conectar.
 */
export interface JamPin {
  /** ¿Es la punta de un pin de hoja? Entonces no es ni entrada ni salida. */
  readonly sheet: boolean
  /** Tipo del pin (original: `BasePin.PinType`). */
  readonly type: PinType
  readonly bitWidth: number
  readonly inverted: boolean
  readonly name: string
}

/**
 * Una punta: donde un pin toca la rejilla (original: `Jam`).
 *
 * Lleva su posición **local** —relativa a la caja del símbolo— y la resuelve a la rejilla
 * teniendo en cuenta el giro, que es justo lo que hace `Jam.AbsolutePoint` en el original.
 */
export class Jam {
  constructor(
    /** El símbolo al que pertenece. */
    readonly symbol: CircuitSymbol,
    /** Su número dentro de los pines del símbolo. Es su identidad. */
    readonly index: number,
    /** Su sitio dentro de la caja, en unidades de rejilla. */
    readonly layout: PinLayout,
    readonly pin: JamPin,
    /**
     * El pin de hoja que representa esta punta, si es una que da al exterior. Es lo que
     * permite, desde el subcircuito, encontrar la punta que le corresponde en la hoja de
     * arriba (`Jam(pin)` en el original).
     */
    readonly sheetPin: Pin | null,
    /**
     * La punta del otro lado, cuando este pin es de hoja (original: `Jam.InnerJam`).
     *
     * Es la idea que hace que un subcircuito funcione sin saber quién lo llama: por fuera
     * el pin es un punto en la caja del subcircuito, y por dentro es otro punto, en la
     * hoja del subcircuito, donde llegan sus cables. Atravesar el pin es saltar de una
     * punta a la otra.
     */
    readonly innerJam: Jam | null,
  ) {}

  /** Identidad por valor, para los conjuntos de visitados. */
  get key(): string {
    return `${this.symbol.id}#${this.index}`
  }

  /** Posición local, en unidades de rejilla (original: `BasePin.GridPoint`). */
  get local(): GridPoint {
    return this.layout.point
  }

  /** Posición en la rejilla del circuito (original: `Jam.AbsolutePoint`). */
  get point(): GridPoint {
    return pinPosition(this.symbol.position, this.symbol.rotation, this.symbol.layout, this.layout)
  }

  get effectivePinType(): PinType {
    return this.pin.sheet ? 'none' : this.pin.type
  }

  get bitWidth(): number {
    return this.pin.bitWidth
  }

  get inverted(): boolean {
    return this.pin.inverted
  }

  /**
   * ¿Existe el bit número `bit` de este pin?
   *
   * El original da por buenos los bits de más cuando el símbolo es una probeta
   * (`Jam.IsValid`), porque una probeta se puede conectar a un cable de cualquier ancho.
   */
  isValid(bit: number): boolean {
    if (bit < 0) {
      return false
    }
    if (bit < this.pin.bitWidth) {
      return true
    }
    return (
      this.symbol.depicted.kind === 'device' && this.symbol.depicted.element.kind === 'probe'
    )
  }
}

/** Un símbolo colocado en una hoja, con sus puntas (original: `CircuitSymbol`). */
export interface CircuitSymbol {
  readonly id: Id
  /** La hoja en la que está colocado (original: `CircuitSymbol.LogicalCircuit`). */
  readonly logicalCircuitId: Id
  readonly position: GridPoint
  readonly rotation: Rotation
  readonly layout: SymbolLayout
  readonly depicted: DepictedCircuit
  /** Sus puntas, en el orden de creación de los pines del original. */
  readonly jams: readonly Jam[]
}

/** La punta de un símbolo que corresponde a un pin de hoja, si la tiene. */
export function jamForPin(symbol: CircuitSymbol, pin: Pin): Jam | null {
  for (const jam of symbol.jams) {
    if (jam.sheetPin !== null && jam.sheetPin.id === pin.id) {
      return jam
    }
  }
  return null
}

/**
 * Las puntas de un símbolo en el orden en que las creó el original (original:
 * `JamComparer` → el `Order` del pin).
 *
 * Hace falta porque `Jams()` las da agrupadas por lados, y hay código que no quiere eso:
 * el tri-estado lee la punta 0 como dato y la 1 como habilitación, y `Splitter.Pass` da
 * por hecho que la punta ancha se creó la primera. Es decir: casi siempre coincide, pero
 * con una compuerta tri-estado deja de coincidir, y ahí importa.
 */
export function jamsByPinOrder(symbol: CircuitSymbol): Jam[] {
  return [...symbol.jams].sort((a, b) => a.layout.order - b.layout.order)
}

/**
 * De dónde saca el índice los circuitos y sus elementos.
 *
 * Es la única puerta que necesita `CircuitMap` para mirar el documento, y existe para que
 * el mapa no dependa de la forma del fichero: hoy el modelo es plano, y si en M4 el
 * formato pide otra cosa, solo cambia quien implemente esto.
 */
export interface SymbolSource {
  circuit(id: Id): Circuit | undefined
  element(id: Id): PlacedElement | undefined
  /** Los símbolos colocados en una hoja, en orden de creación. */
  elementsOf(circuitId: Id): readonly PlacedElement[]
  wiresOf(circuitId: Id): readonly Wire[]
}

/** Un índice sobre un documento: circuitos, símbolos y puntas, sin construir dos veces. */
export class SymbolIndex {
  private readonly circuits = new Map<Id, Circuit>()
  private readonly elements = new Map<Id, PlacedElement>()
  private readonly symbols = new Map<Id, CircuitSymbol>()

  constructor(private readonly source: SymbolSource) {}

  /** Registra un circuito para poder resolver subcircuitos por identificador. */
  addCircuit(circuit: Circuit): void {
    this.circuits.set(circuit.id, circuit)
    for (const element of circuit.elements) {
      if (element.kind !== 'wire') {
        this.elements.set(element.id, element)
      }
    }
  }

  circuit(id: Id): Circuit | undefined {
    return this.circuits.get(id) ?? this.source.circuit(id)
  }

  element(id: Id): PlacedElement | undefined {
    return this.elements.get(id) ?? this.source.element(id)
  }

  elementsOf(circuitId: Id): readonly PlacedElement[] {
    return this.source.elementsOf(circuitId)
  }

  wiresOf(circuitId: Id): readonly Wire[] {
    return this.source.wiresOf(circuitId)
  }

  /** El símbolo de un elemento colocado. Se fabrica una vez y se reutiliza. */
  symbol(element: PlacedElement): CircuitSymbol {
    const cached = this.symbols.get(element.id)
    if (cached !== undefined) {
      return cached
    }

    const { depicted, layout } = describe(this, element)
    const jams: Jam[] = []
    const symbol: CircuitSymbol = {
      id: element.id,
      logicalCircuitId: element.circuitId,
      position: element.position,
      rotation: element.rotation,
      layout,
      depicted,
      jams,
    }
    // El símbolo tiene que estar en el índice **antes** de construir sus puntas: la punta
    // de un pin de hoja apunta a la punta del pin de dentro, y esa sí que puede volver a
    // pedir el símbolo de un pin. Sin esto, se mordería la cola.
    this.symbols.set(element.id, symbol)

    jams.push(...buildJams(this, symbol, element, depicted))
    return symbol
  }
}

/** El circuito que representa un elemento y la forma con la que se dibuja. */
function describe(
  index: SymbolIndex,
  element: PlacedElement,
): { readonly depicted: DepictedCircuit; readonly layout: SymbolLayout } {
  switch (element.kind) {
    case 'gate':
      return {
        depicted: { kind: 'gate', element },
        layout: deviceLayout(element),
      }

    case 'button':
      return {
        depicted: { kind: 'button', element },
        layout: buttonLayout(element.inverted),
      }

    case 'pin':
      return { depicted: { kind: 'pin', element }, layout: pinLayout(element) }

    case 'splitter':
      return { depicted: { kind: 'splitter', element }, layout: splitterLayout(element) }

    case 'constant':
      // La constante ya sabe simularse (`defineConstant` en `circuit-map.ts`); lo que
      // faltaba era su símbolo. Tiene una sola punta de salida, del ancho del valor, y
      // `collect` crea un resultado por bit.
      return { depicted: { kind: 'device', element }, layout: constantLayout(element) }

    case 'probe':
      // Una probeta solo tiene una punta de entrada; su tamaño y su lado salen del modelo.
      return { depicted: { kind: 'device', element }, layout: deviceLayout(element) }

    case 'sensor':
      return { depicted: { kind: 'device', element }, layout: deviceLayout(element) }

    case 'circuit': {
      const circuit = index.circuit(element.targetCircuitId)
      if (circuit === undefined) {
        throw new Error(
          `CircuitSymbol: el subcircuito «${element.targetCircuitId}» no existe en el documento`,
        )
      }
      return {
        depicted: { kind: 'subcircuit', circuit },
        layout: circuitInstanceLayout(circuit),
      }
    }

    case 'memory':
    case 'ledMatrix':
    case 'sound':
    case 'graphicsArray':
      // Estas sí son primitivas, pero su forma todavía no está portada: llegan con M2-12.
      // Se avisa en vez de inventarse un tamaño, porque un tamaño inventado movería los
      // pines y el circuito simularía mal.
      throw new Error(
        `CircuitSymbol: la forma de «${element.kind}» todavía no está portada (M2-12)`,
      )
  }
}

/** Las puntas de un símbolo, en el orden en que las enumera el original. */
function buildJams(
  index: SymbolIndex,
  symbol: CircuitSymbol,
  element: PlacedElement,
  depicted: DepictedCircuit,
): Jam[] {
  switch (depicted.kind) {
    case 'gate': {
      const layout = deviceLayout(depicted.element)
      return layout.pins.map(
        (pin, position) =>
          new Jam(
            symbol,
            position,
            pin,
            {
              sheet: false,
              type: pin.type,
              bitWidth: pin.bitWidth,
              inverted: pin.inverted,
              name: '',
            },
            null,
            null,
          ),
      )
    }

    case 'button': {
      const layout = deviceLayout(depicted.element)
      return layout.pins.map(
        (pin, position) =>
          new Jam(
            symbol,
            position,
            pin,
            {
              sheet: false,
              type: pin.type,
              bitWidth: pin.bitWidth,
              inverted: pin.inverted,
              name: '',
            },
            null,
            null,
          ),
      )
    }

    case 'pin': {
      // El pin de hoja colocado tiene **una** punta: la de dentro. La de fuera la pone el
      // símbolo del subcircuito, con `sheet: true` y el `innerJam` apuntando aquí.
      const layout = symbol.layout
      const pin = layout.pins[0]
      if (pin === undefined) {
        return []
      }
      return [
        new Jam(
          symbol,
          0,
          pin,
          {
            sheet: false,
            type: 'none',
            bitWidth: pin.bitWidth,
            inverted: pin.inverted,
            name: depicted.element.name,
          },
          null,
          null,
        ),
      ]
    }

    case 'splitter': {
      const layout = symbol.layout
      return layout.pins.map(
        (pin, position) =>
          new Jam(
            symbol,
            position,
            pin,
            {
              sheet: false,
              type: 'none',
              bitWidth: pin.bitWidth,
              inverted: false,
              name: '',
            },
            null,
            null,
          ),
      )
    }

    case 'subcircuit': {
      const layout = circuitSymbolLayout(sheetPinSpecs(depicted.circuit))
      // Los pines se emparejan por **identidad**, no por orden: `sheetPinSpecs` los ordena
      // como los coloca la rejilla (por Y, luego X, luego nombre) y `Jams()` los vuelve a
      // agrupar por lados, así que la posición dentro de `layout.pins` no es la del
      // fichero. Cada `PinLayout` guarda en `order` de dónde salió, y por ahí se vuelve.
      const pins = sortedSheetPins(depicted.circuit)
      return layout.pins.map((pin, position) => {
        const sheetPin = pins[pin.order]
        if (sheetPin === undefined) {
          throw new Error(
            `CircuitSymbol: el subcircuito «${depicted.circuit.name}» cambió de pines a mitad de camino`,
          )
        }
        const inner = index.symbol(sheetPin).jams[0] ?? null
        return new Jam(
          symbol,
          position,
          pin,
          {
            sheet: true,
            type: 'none',
            bitWidth: pin.bitWidth,
            inverted: pin.inverted,
            name: sheetPin.name,
          },
          sheetPin,
          inner,
        )
      })
    }

    case 'device':
      // La constante y la probeta llegan aquí; las demás primitivas avisan en `describe`
      // antes de construir puntas. La constante tiene una salida del ancho del valor y la
      // probeta una entrada de 1 bit que el motor ensancha al cable que mira.
      return symbol.layout.pins.map(
        (pin, position) =>
          new Jam(
            symbol,
            position,
            pin,
            {
              sheet: false,
              type: pin.type,
              bitWidth: pin.bitWidth,
              inverted: pin.inverted,
              name: '',
            },
            null,
            null,
          ),
      )
  }
}

/** Los símbolos colocados en una hoja. */
export function symbolsOf(index: SymbolIndex, circuitId: Id): CircuitSymbol[] {
  return index.elementsOf(circuitId).map((element) => index.symbol(element))
}

/** El mapa de conductores de una hoja: qué cables se tocan. */
export function conductorMapOf(index: SymbolIndex, circuitId: Id): ConductorMap {
  return new ConductorMap(index.wiresOf(circuitId))
}

/**
 * Un `SymbolSource` sobre un documento del modelo.
 *
 * Recorre lo que hay guardado en cada hoja y lo parte en símbolos y cables. Los elementos
 * que el editor todavía no sabe colocar (pines, subcircuitos) se aceptan igual: si están
 * en el documento, cuentan.
 */
export function projectSymbolSource(project: Project): SymbolSource {
  const circuits = new Map<Id, Circuit>()
  const elements = new Map<Id, PlacedElement>()
  for (const circuit of project.circuits) {
    circuits.set(circuit.id, circuit)
    for (const element of circuit.elements) {
      if (element.kind !== 'wire') {
        elements.set(element.id, element)
      }
    }
  }

  return {
    circuit: (id) => circuits.get(id),
    element: (id) => elements.get(id),
    elementsOf: (circuitId) =>
      (circuits.get(circuitId)?.elements ?? []).filter(
        (element): element is PlacedElement => element.kind !== 'wire',
      ),
    wiresOf: (circuitId) =>
      (circuits.get(circuitId)?.elements ?? []).filter(
        (element): element is Wire => element.kind === 'wire',
      ),
  }
}

/** Un `SymbolSource` sobre un solo circuito, para los tests y los casos de una hoja. */
export function singleCircuitSource(circuit: Circuit): SymbolSource {
  return projectSymbolSource({
    id: circuit.id,
    name: circuit.name,
    circuits: [circuit],
    mainCircuitId: circuit.id,
  })
}

/** Atajo: el índice de un proyecto completo. */
export function projectIndex(project: Project): SymbolIndex {
  const index = new SymbolIndex(projectSymbolSource(project))
  for (const circuit of project.circuits) {
    index.addCircuit(circuit)
  }
  return index
}

/** Atajo: el índice de una sola hoja. */
export function circuitIndex(circuit: Circuit): SymbolIndex {
  const index = new SymbolIndex(singleCircuitSource(circuit))
  index.addCircuit(circuit)
  return index
}
