import type { CircuitState } from '../simulate/circuit-state'
import { State } from './state'

/**
 * Base de todas las funciones lógicas del motor.
 *
 * Portado de `LogicCircuit/CircuitFunction.cs`. Lleva los índices de los
 * parámetros y resultados en el estado de simulación, y ofrece las ayudas
 * (`And`, `Or`, `Not`, `SetResult`, ...) que usan las compuertas concretas.
 */
export abstract class CircuitFunction {
  protected static readonly EMPTY_LIST: number[] = []

  private readonly parameter: number[]
  private readonly result: number[]
  private readonly result0: number

  public circuitState: CircuitState
  public iteration = 0
  public dependent: CircuitFunction[] | null = null

  protected constructor(
    circuitState: CircuitState,
    parameter: number[] | null,
    result: number[] | null,
  ) {
    this.circuitState = circuitState
    this.parameter = parameter ?? CircuitFunction.EMPTY_LIST
    this.result = result ?? CircuitFunction.EMPTY_LIST
    this.result0 = this.result.length > 0 ? this.result[0]! : -1
    this.circuitState.defineFunction(this)
  }

  public get parameters(): readonly number[] {
    return this.parameter
  }

  public get results(): readonly number[] {
    return this.result
  }

  public get parameterCount(): number {
    return this.parameter.length
  }

  public get resultCount(): number {
    return this.result.length
  }

  public abstract evaluate(): boolean

  public get name(): string {
    return this.constructor.name
  }

  public abstract get reportName(): string

  public static fromBool(value: boolean): State {
    return value ? State.On1 : State.On0
  }

  public static toChar(state: State): string {
    switch (state) {
      case State.Off:
        return '-'
      case State.On0:
        return '0'
      case State.On1:
        return '1'
      default:
        throw CircuitFunction.badState(state)
    }
  }

  public static toText(probeState: Iterable<State>, showFormatPrefix: boolean): string {
    let value = 0
    let count = 0
    for (const state of probeState) {
      if (count >= 32) {
        // Tracer.Assert(count < 32)
      }
      switch (state) {
        case State.Off:
          return CircuitFunction.binary(probeState)
        case State.On0:
          break
        case State.On1:
          value |= 1 << count
          break
        default:
          // Tracer.Fail()
          break
      }
      count++
    }
    if (showFormatPrefix && 1 < count) {
      return `0x${value.toString(16).toUpperCase()}`
    }
    return value.toString(16).toUpperCase()
  }

  private static binary(probeState: Iterable<State>): string {
    const text: string[] = []
    let index = 0
    for (const state of probeState) {
      text[index++] = CircuitFunction.toChar(state)
    }
    text.reverse()
    return text.join('').slice(0, index)
  }

  protected setResult0(state: State): boolean {
    if (this.circuitState[this.result0] !== state) {
      this.circuitState[this.result0] = state
      return true
    }
    return false
  }

  protected setResult(index: number, state: State): boolean {
    if (this.circuitState[this.result[index]!] !== state) {
      this.circuitState[this.result[index]!] = state
      return true
    }
    return false
  }

  protected setResultState(state: State): boolean {
    return this.setResult(0, state)
  }

  /**
   * Pone un resultado multi-bit a partir de un entero de 32 bits.
   */
  protected setResultInt(state: number): boolean {
    let changed = false
    for (let i = 0; i < this.result.length; i++) {
      changed =
        changed ||
        this.setResult(i, CircuitFunction.fromBool((state & (1 << i)) !== 0))
    }
    return changed
  }

  protected triStateGroup(): State {
    let state: State = State.Off
    for (const index of this.parameter) {
      switch (this.circuitState[index]) {
        case State.On0:
          return State.On0
        case State.On1:
          state = State.On1
          break
        case State.Off:
          break
        default:
          throw CircuitFunction.badState(this.circuitState[index]!)
      }
    }
    return state
  }

  protected and(): State {
    for (let i = 0; i < this.parameter.length; i++) {
      if (this.circuitState[this.parameter[i]!] === State.On0) {
        return State.On0
      }
    }
    return State.On1
  }

  protected or(): State {
    for (let i = 0; i < this.parameter.length; i++) {
      if (this.circuitState[this.parameter[i]!] === State.On1) {
        return State.On1
      }
    }
    return State.On0
  }

  protected static not(state: State): State {
    switch (state) {
      case State.Off:
        return State.On0
      case State.On0:
        return State.On1
      case State.On1:
        return State.On0
      default:
        throw CircuitFunction.badState(state)
    }
  }

  protected controlledState(enable: State): State {
    return this.circuitState[this.parameter[1]!] === enable
      ? this.circuitState[this.parameter[0]!]!
      : State.Off
  }

  protected count(state: State): number {
    let count = 0
    for (const index of this.parameter) {
      if (this.circuitState[index] === state) {
        count++
      }
    }
    return count
  }

  protected getProbeState(state: State[]): boolean {
    let changed = false
    let s: State
    for (let i = 0; i < this.parameter.length; i++) {
      if (state[i] !== (s = this.circuitState[this.parameter[i]!]!)) {
        state[i] = s
        changed = true
      }
    }
    return changed
  }

  protected readNumericState(parameters: number[]): number {
    // Tracer.Assert(parameters.Length <= 32)
    let state = 0
    for (let i = 0; i < parameters.length; i++) {
      if (this.circuitState[parameters[i]!] === State.On1) {
        state |= 1 << i
      }
    }
    return state
  }

  private static badState(state: State): Error {
    return new Error(`Unknown state: ${state}`)
  }
}

/**
 * Constante de un bit: saca siempre el mismo estado.
 *
 * Portado de `OneBitConst.cs`.
 */
export class OneBitConst extends CircuitFunction {
  private state: State

  constructor(circuitState: CircuitState, state: State, result: number) {
    super(circuitState, null, [result])
    this.state = state
  }

  public get State(): State {
    return this.state
  }

  public setState(newState: State): void {
    if (this.state !== newState) {
      this.state = newState
      this.circuitState.markUpdated(this)
    }
  }

  public override evaluate(): boolean {
    return this.setResult0(this.state)
  }

  public override get reportName(): string {
    throw new Error('InvalidOperationException')
  }
}

/**
 * Base de las sondas (probetas): guardan el estado leído de sus parámetros
 * para poder mostrarlo.
 *
 * Portado de `Probe.cs`.
 */
export abstract class Probe extends CircuitFunction {
  protected state: State[]

  protected constructor(circuitState: CircuitState, parameter: number[] | null) {
    super(circuitState, parameter, null)
    const count = parameter !== null ? parameter.length : 0
    this.state = count > 0 ? new Array<State>(count) : []
  }

  public toText(): string {
    return CircuitFunction.toText(this.state, false)
  }

  protected getState(): boolean {
    return this.getProbeState(this.state)
  }

  public get bitWidth(): number {
    return this.state !== null ? this.state.length : 0
  }

  public get(index: number): State {
    return this.state[index]!
  }

  protected copyTo(copy: State[]): void {
    if (copy === null || copy.length !== this.state.length) {
      throw new RangeError('copy')
    }
    for (let i = 0; i < this.state.length; i++) {
      copy[i]! = this.state[i]!
    }
  }
}
