import { CircuitFunction } from './circuit-function'
import type { CircuitState } from '../simulate/circuit-state'
import { State } from './state'

/**
 * Compuertas lógicas. Portadas de `Function/Function*.cs`.
 *
 * Las versiones especializadas del original (And1..And5, etc.) son
 * optimizaciones de rendimiento; aquí se usa la versión común, que da el mismo
 * resultado para cualquier número de entradas. `reportName` devuelve una clave
 * legible hasta que llegue la i18n (M11).
 */

export class FunctionAnd extends CircuitFunction {
  static create(circuitState: CircuitState, parameter: number[], result: number): FunctionAnd {
    return new FunctionAnd(circuitState, parameter, result)
  }
  constructor(circuitState: CircuitState, parameter: number[], result: number) {
    super(circuitState, parameter, [result])
  }
  override evaluate(): boolean {
    return this.setResult0(this.and())
  }
  override get reportName(): string {
    return `AND(${this.parameterCount})`
  }
}

export class FunctionAndNot extends CircuitFunction {
  static create(circuitState: CircuitState, parameter: number[], result: number): FunctionAndNot {
    return new FunctionAndNot(circuitState, parameter, result)
  }
  constructor(circuitState: CircuitState, parameter: number[], result: number) {
    super(circuitState, parameter, [result])
  }
  override evaluate(): boolean {
    return this.setResult0(CircuitFunction.not(this.and()))
  }
  override get reportName(): string {
    return `NAND(${this.parameterCount})`
  }
}

export class FunctionOr extends CircuitFunction {
  static create(circuitState: CircuitState, parameter: number[], result: number): FunctionOr {
    return new FunctionOr(circuitState, parameter, result)
  }
  constructor(circuitState: CircuitState, parameter: number[], result: number) {
    super(circuitState, parameter, [result])
  }
  override evaluate(): boolean {
    return this.setResult0(this.or())
  }
  override get reportName(): string {
    return `OR(${this.parameterCount})`
  }
}

export class FunctionOrNot extends CircuitFunction {
  static create(circuitState: CircuitState, parameter: number[], result: number): FunctionOrNot {
    return new FunctionOrNot(circuitState, parameter, result)
  }
  constructor(circuitState: CircuitState, parameter: number[], result: number) {
    super(circuitState, parameter, [result])
  }
  override evaluate(): boolean {
    return this.setResult0(CircuitFunction.not(this.or()))
  }
  override get reportName(): string {
    return `NOR(${this.parameterCount})`
  }
}

export class FunctionXor extends CircuitFunction {
  static create(circuitState: CircuitState, parameter: number[], result: number): FunctionXor {
    return new FunctionXor(circuitState, parameter, result)
  }
  constructor(circuitState: CircuitState, parameter: number[], result: number) {
    super(circuitState, parameter, [result])
  }
  override evaluate(): boolean {
    return this.setResult0(CircuitFunction.fromBool((this.count(State.On1) & 1) === 1))
  }
  override get reportName(): string {
    return `XOR(${this.parameterCount})`
  }
}

export class FunctionXorNot extends CircuitFunction {
  static create(circuitState: CircuitState, parameter: number[], result: number): FunctionXorNot {
    return new FunctionXorNot(circuitState, parameter, result)
  }
  constructor(circuitState: CircuitState, parameter: number[], result: number) {
    super(circuitState, parameter, [result])
  }
  override evaluate(): boolean {
    return this.setResult0(CircuitFunction.fromBool((this.count(State.On1) & 1) !== 1))
  }
  override get reportName(): string {
    return `XNOR(${this.parameterCount})`
  }
}

export class FunctionNot extends CircuitFunction {
  constructor(circuitState: CircuitState, parameter: number, result: number) {
    super(circuitState, [parameter], [result])
  }
  override evaluate(): boolean {
    const param0 = this.parameters[0]!
    return this.setResult0(CircuitFunction.not(this.circuitState.get(param0)!))
  }
  override get reportName(): string {
    return 'NOT'
  }
}

export class FunctionTriState extends CircuitFunction {
  constructor(circuitState: CircuitState, parameter: number, enable: number, result: number) {
    super(circuitState, [parameter, enable], [result])
  }
  override evaluate(): boolean {
    return this.setResult0(this.controlledState(State.On1))
  }
  override get reportName(): string {
    return 'TriState'
  }
}

export class FunctionTriStateGroup extends CircuitFunction {
  constructor(circuitState: CircuitState, parameter: number[], result: number) {
    super(circuitState, parameter, [result])
  }
  override evaluate(): boolean {
    return this.setResult0(this.triStateGroup())
  }
  override get reportName(): string {
    return 'TriStateGroup'
  }
}