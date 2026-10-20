/**
 * Probetas (M2-12).
 *
 * Portado de `Function/Probe.cs` y `Function/FunctionProbe.cs`. Una probeta no calcula
 * nada: **mira** los bits que le llegan y guarda un historial para el osciloscopio. Por eso
 * su `evaluate()` devuelve siempre `false`: no propaga cambios, solo se entera.
 */
import { Probe } from './circuit-function'
import { State } from './state'
import type { CircuitState } from '../simulate/circuit-state'
import { ScopeBuffer } from '../simulate/scope-buffer'
import type { CircuitSymbol } from '../model/symbol'

export class FunctionProbe extends Probe {
  invalid = false
  readonly label: string
  readonly symbol: CircuitSymbol | null
  private readonly tickHistory: ScopeBuffer<State>[]
  private readonly valueHistory: ScopeBuffer<bigint>

  constructor(
    symbol: CircuitSymbol | null,
    circuitState: CircuitState,
    parameter: number[],
    capacity: number,
    label = '',
  ) {
    super(circuitState, parameter)
    this.symbol = symbol
    this.label = label
    const size = Math.max(1, capacity)
    this.tickHistory = Array.from(
      { length: this.state.length },
      () => new ScopeBuffer<State>(size),
    )
    this.valueHistory = new ScopeBuffer<bigint>(size)
    this.valueHistory.add(this.pack())
    circuitState.registerProbe(this)
  }

  override get reportName(): string {
    return 'Probe'
  }

  /** Una probeta no escribe: solo guarda lo que ve. */
  override evaluate(): boolean {
    if (this.getState()) {
      this.valueHistory.add(this.pack())
      this.invalid = true
    }
    return false
  }

  /** Guarda una muestra del estado actual (original: `Tick`). */
  tick(): void {
    for (let bit = 0; bit < this.bitWidth; bit += 1) {
      this.tickHistory[bit]?.add(this.get(bit))
    }
  }

  /** Las muestras de un bit, de la más antigua a la más reciente. */
  read(bitNumber: number): State[] {
    return this.tickHistory[bitNumber]?.toArray() ?? []
  }

  /** Empaqueta los estados en dos bits por señal, como el `long` del original. */
  pack(): bigint {
    let packed = 0n
    for (let bit = 0; bit < this.bitWidth; bit += 1) {
      packed |= BigInt((this.get(bit) as number) & 0x03) << BigInt(2 * bit)
    }
    return packed
  }

  /** Desempaqueta un estado concreto. */
  unpack(packed: bigint, bitNumber: number): State {
    return Number((packed >> BigInt(2 * bitNumber)) & 0x03n) as State
  }

  /** Convierte el paquete en un entero, o `null` si algún bit está en alta impedancia. */
  static toInt(packed: bigint, bitWidth: number): number | null {
    let value = 0
    for (let bit = 0; bit < bitWidth; bit += 1) {
      const state = Number((packed >> BigInt(2 * bit)) & 0x03n) as State
      if (state === State.Off) return null
      if (state === State.On1) value += 2 ** bit
    }
    return value
  }

  /** Las muestras empaquetadas del historial de valores. */
  readValues(): bigint[] {
    return this.valueHistory.toArray()
  }

  /** Añade una marca vertical al historial (original: `Mark`). */
  mark(): void {
    this.valueHistory.add(-1n)
  }
}
