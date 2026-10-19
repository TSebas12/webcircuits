/**
 * El aplanado del circuito: los símbolos que de verdad se simulan.
 *
 * Portado de `LogicCircuit/Runner/CircuitMap.SymbolMap.cs`.
 *
 * Aquí se resuelve la parte difícil del original: un circuito es un árbol —un subcircuito
 * contiene subcircuitos— pero la simulación necesita una **lista plana** de funciones que
 * se puedan ordenar y evaluar. El aplanado baja por el árbol y, en cada hoja, anota:
 *
 *   - un `Result` por cada **bit de salida** de un símbolo primitivo: ése es el sitio donde
 *     el símbolo *escribe* su valor;
 *   - un `Parameter` por cada **bit de entrada** que recibe, apuntando al `Result` del bit
 *     que lo alimenta. Con esto, la evaluación no necesita buscar nada: sabe leer de dónde
 *     viene cada entrada.
 *
 * El caso bonito es el **tri-estado**: varios resultados pueden escribir en el mismo cable,
 * pero solo uno a la vez. El original los une en un *grupo* que comparte el índice de estado
 * (`Link`), de modo que el circuito tiene un solo cable con un solo valor, y aparte da a cada
 * miembro un índice **privado** para saber si está emitiendo o desconectado.
 *
 * ⚠️ Las claves van por **identidad**: un símbolo colocado dentro de un subcircuito aparece
 * en *todos* los mapas de sus colocaciones, así que la clave de un símbolo es (mapa, símbolo)
 * y la de un juego de bits es (punta, bit). Ver `model/symbol.ts`.
 */

import type { CircuitSymbol, Jam } from '../model/symbol'
import { CircuitError } from '../circuit-error'
import type { CircuitState } from './circuit-state'
import type { CircuitMap } from './circuit-map'

/** La clave de un resultado o un parámetro: qué punta, y qué bit de esa punta. */
function jamKey(jam: Jam, bitNumber: number): string {
  return `${jam.key}|${bitNumber}`
}

/**
 * La clave de una punta visitada durante el recorrido (original: `JamBit`).
 *
 * Lleva el mapa porque la misma punta puede encontrarse desde mapas distintos, y ahí está
 * la gracia: es lo que impide que un lazo se recorra para siempre.
 */
export function jamBitKey(mapId: number, jam: Jam, bit: number): string {
  return `${mapId}|${jam.key}|${bit}`
}

/** La clave de un símbolo colocado: (mapa, símbolo), por identidad. */
export class SymbolMapKey {
  constructor(
    readonly circuitMap: CircuitMap,
    readonly circuitSymbol: CircuitSymbol,
  ) {}

  get key(): string {
    return `${this.circuitMap.mapId}:${this.circuitSymbol.id}`
  }
}

/** El aplanado en curso: los símbolos ya recogidos, sin repetir. */
export class SymbolMapList {
  private readonly symbols = new Map<string, SymbolMap>()

  addSymbol(circuitMap: CircuitMap, circuitSymbol: CircuitSymbol): SymbolMap {
    const key = new SymbolMapKey(circuitMap, circuitSymbol)
    let map = this.symbols.get(key.key)
    if (map === undefined) {
      map = new SymbolMap(key)
      this.symbols.set(key.key, map)
    }
    return map
  }

  addResult(circuitMap: CircuitMap, jam: Jam, bitNumber: number): Result {
    // Tracer.Assert(IsPrimitive(jam.CircuitSymbol.Circuit))
    const map = this.addSymbol(circuitMap, jam.symbol)
    return map.addResult(circuitMap, jam, bitNumber)
  }

  addParameter(result: Result, circuitMap: CircuitMap, jam: Jam, bitNumber: number): Parameter {
    // Tracer.Assert(IsPrimitive(jam.CircuitSymbol.Circuit))
    const map = this.addSymbol(circuitMap, jam.symbol)
    return map.addParameter(result, circuitMap, jam, bitNumber)
  }

  /** Los símbolos recogidos, en el orden en que se añadieron. */
  get symbolMaps(): SymbolMap[] {
    return [...this.symbols.values()]
  }

  remove(map: SymbolMap): void {
    this.symbols.delete(new SymbolMapKey(map.circuitMap, map.circuitSymbol).key)
  }
}

/** Un símbolo primitivo, con sus resultados y sus parámetros. */
export class SymbolMap {
  private readonly resultMap = new Map<string, Result>()
  private readonly parameterMap = new Map<string, Parameter>()

  constructor(private readonly keyValue: SymbolMapKey) {}

  get circuitMap(): CircuitMap {
    return this.keyValue.circuitMap
  }

  get circuitSymbol(): CircuitSymbol {
    return this.keyValue.circuitSymbol
  }

  addResult(circuitMap: CircuitMap, jam: Jam, bitNumber: number): Result {
    // Tracer.Assert(circuitMap.Circuit == jam.CircuitSymbol.LogicalCircuit
    //   && jam.CircuitSymbol == this.key.CircuitSymbol)
    const result = new Result(circuitMap, jam, bitNumber)
    this.resultMap.set(jamKey(jam, bitNumber), result)
    return result
  }

  /**
   * Anota que un bit de este símbolo recibe su valor de un resultado.
   *
   * Si ya estaba anotado y los dos son tri-estado, los une (`Link`): es el caso de dos
   * salidas tri-estado escribiendo en el mismo cable. Si ya estaba anotado y alguno no es
   * tri-estado, es un cortocircuito de verdad —dos salidas peleándose— y se avisa.
   */
  addParameter(result: Result, circuitMap: CircuitMap, jam: Jam, bitNumber: number): Parameter {
    const key = jamKey(jam, bitNumber)
    const existing = this.parameterMap.get(key)
    if (existing !== undefined) {
      if (!existing.result.isTriState || !result.isTriState) {
        if (
          existing.result === result &&
          existing.circuitMap === circuitMap &&
          existing.jam === jam &&
          existing.bitNumber === bitNumber
        ) {
          return existing
        }
        throw new CircuitError(
          `El pin «${jam.pin.name}» de «${circuitMap.circuit.name}» recibe la salida de más ` +
            `de un sitio. Dos salidas distintas no pueden alimentar la misma entrada.`,
        )
      }
      existing.result.link(result)
      return existing
    }

    const parameter = new Parameter(result, circuitMap, jam, bitNumber)
    this.parameterMap.set(key, parameter)
    result.add(parameter)
    return parameter
  }

  get hasResults(): boolean {
    return this.resultMap.size > 0
  }

  get results(): Result[] {
    return [...this.resultMap.values()]
  }

  get parameters(): Parameter[] {
    return [...this.parameterMap.values()]
  }

  result(jam: Jam, bitNumber: number): Result | null {
    return this.resultMap.get(jamKey(jam, bitNumber)) ?? null
  }

  parameter(jam: Jam, bitNumber: number): Parameter | null {
    return this.parameterMap.get(jamKey(jam, bitNumber)) ?? null
  }

  /** Los parámetros de una punta, del bit menos significativo al más. */
  allParameters(jam: Jam): Parameter[] {
    return this.parameters
      .filter((parameter) => parameter.jam === jam)
      .sort((a, b) => a.bitNumber - b.bitNumber)
  }
}

/**
 * Un sitio del circuito donde se guarda un bit: la punta y el número de bit.
 *
 * De aquí sale el **índice de estado**: la posición en el array de la simulación, que es
 * lo único que las funciones necesitan saber para leer y escribir. En el original son
 * índices enteros, no punteros, justo para que la evaluación no tenga que recorrer nada.
 */
abstract class StateIndex {
  constructor(
    readonly circuitMap: CircuitMap,
    readonly jam: Jam,
    readonly bitNumber: number,
  ) {
    // Tracer.Assert(circuitMap.Circuit == jam.CircuitSymbol.LogicalCircuit)
    // Tracer.Assert(jam.IsValid(bitNumber))
  }

  abstract toString(): string
}

/**
 * El bit de salida de un símbolo primitivo: donde el símbolo **escribe**.
 *
 * Los tri-estado comparten el índice de estado con su grupo (un solo cable, un solo valor)
 * y además llevan uno privado para distinguir «emitiendo 0» de «desconectado».
 */
export class Result extends StateIndex {
  private group: Set<Result> | null
  parameters: Parameter[] = []
  stateIndex = 0
  privateIndex = 0

  constructor(circuitMap: CircuitMap, jam: Jam, bitNumber: number) {
    super(circuitMap, jam, bitNumber)
    // Tracer.Assert(jam.Pin.PinType == PinType.Output)
    // El tri-estado se reconoce por la compuerta, no por el pin: es la única que puede
    // quedarse sin emitir, y por eso es la única que necesita grupo e índice privado.
    this.group = isTriStateJam(jam) ? new Set([this]) : null
  }

  get isTriState(): boolean {
    return this.group !== null
  }

  /**
   * Los otros resultados que escriben en el mismo cable, si es tri-estado.
   *
   * Lo necesita `DefineTriState` para crear el grupo que decide cuál emite. Se devuelve el
   * conjunto **de verdad**, no una copia, porque quien lo llama también lo vacía
   * (`Clear()` en el original) para no crear el grupo dos veces.
   */
  triStateMembers(): Set<Result> | null {
    return this.group
  }

  add(parameter: Parameter): void {
    this.parameters.push(parameter)
  }

  /**
   * Une este grupo con el de otro resultado tri-estado (original: `Result.Link`).
   *
   * Los dos pasan a compartir el índice de estado y **la misma lista** de parámetros, así
   * que lo que recibe uno lo ven los dos. Es lo que hace que un cable con tres tri-estado
   * siga siendo un solo cable.
   */
  link(other: Result): void {
    // Tracer.Assert(this.isTriState)
    if (this.group !== other.group) {
      const otherGroup = other.group as Set<Result>
      this.parameters.push(...other.parameters)
      for (const result of otherGroup) {
        this.group?.add(result)
      }
      for (const result of otherGroup) {
        result.group = this.group
        result.parameters = this.parameters
      }
    }
  }

  /**
   * Pide sus índices al array de la simulación (original: `Result.Allocate`).
   *
   * Los no tri-estado piden uno. Los tri-estado, dos: el compartido (el cable) y el
   * privado (para saber si están emitiendo).
   */
  allocate(circuitState: CircuitState): void {
    // Tracer.Assert(this.PrivateIndex == 0)
    if (this.group !== null && this.group.size > 0) {
      if (this.stateIndex === 0) {
        this.stateIndex = circuitState.reserveState()
        for (const result of this.group) {
          result.stateIndex = this.stateIndex
        }
      }
      this.privateIndex = circuitState.reserveState()
    } else {
      this.stateIndex = circuitState.reserveState()
    }
    // Tracer.Assert(0 < this.stateIndex)
  }

  toString(): string {
    const point = this.jam.point
    return `Result: jam@${point.x},${point.y}, bit#${this.bitNumber}`
  }
}

/** El bit de entrada de un símbolo primitivo: de dónde **lee** su valor. */
export class Parameter extends StateIndex {
  constructor(
    readonly result: Result,
    circuitMap: CircuitMap,
    jam: Jam,
    bitNumber: number,
  ) {
    super(circuitMap, jam, bitNumber)
    // Tracer.Assert(jam.Pin.PinType == PinType.Input)
  }

  toString(): string {
    const point = this.jam.point
    return `Parameter: jam@${point.x},${point.y}, bit#${this.bitNumber}`
  }
}

/** ¿Este resultado está en una compuerta tri-estado? */
function isTriStateJam(jam: Jam): boolean {
  const depicted = jam.symbol.depicted
  return (
    depicted.kind === 'gate' &&
    (depicted.element.gateType === 'triState1' || depicted.element.gateType === 'triState2')
  )
}

/** Compara por número de bit (original: `ResultComparer` y `ParameterComparer`). */
export function byBitNumber<T extends { readonly bitNumber: number }>(a: T, b: T): number {
  return a.bitNumber - b.bitNumber
}
