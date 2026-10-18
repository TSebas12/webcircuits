/**
 * Contratos que implementan las funciones que lo necesitan (reloj, memoria,
 * visual). Portados de `IFunctionClock.cs`, `IFunctionMemory.cs` e
 * `IFunctionVisual.cs`.
 */

export interface IFunctionClock {
  flip(): boolean
}

export interface IFunctionMemory {
  readonly addressBitWidth: number
  readonly dataBitWidth: number
  get(index: number): number
  set(index: number, value: number): void
}

export interface IFunctionVisual {
  turnOn(): void
  turnOff(): void
  redraw(force: boolean): void
  invalid: boolean
}