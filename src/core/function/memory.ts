/**
 * Memoria (RAM/ROM) como función del motor.
 *
 * Portado de `Function/FunctionMemory.cs`, `FunctionRam.cs` y `FunctionRom.cs`.
 * Solo se simula el primer puerto; el segundo (dual port) se reserva en el modelo
 * pero no se evalúa todavía.
 */
import { CircuitFunction } from './circuit-function'
import type { CircuitState } from '../simulate/circuit-state'
import { State } from './state'
import { cellValue, memoryValue, setCellValue } from '../model/memory-data'
import type { MemoryOnStart } from '../model/types'

export class FunctionMemory extends CircuitFunction {
  private readonly address: number[]
  private readonly inputData: number[] | null
  private readonly outputData: number[]
  private readonly write: number
  private readonly writeOn: State
  private oldWriteState: State = State.Off
  private readonly data: Uint8Array
  private readonly dataBitWidth: number

  constructor(
    circuitState: CircuitState,
    address: number[],
    inputData: number[] | null,
    outputData: number[],
    write: number,
    memory: { readonly isRom: boolean; readonly writeOn1: boolean; readonly onStart: MemoryOnStart; readonly data?: string; readonly addressBitWidth: number; readonly dataBitWidth: number },
  ) {
    const parameter = inputData !== null ? [...address, ...inputData, write] : [...address]
    super(circuitState, parameter, outputData)
    this.address = address
    this.inputData = inputData
    this.outputData = outputData
    this.write = write
    this.writeOn = memory.writeOn1 ? State.On1 : State.On0
    this.dataBitWidth = memory.dataBitWidth

    if (inputData !== null) {
      // RAM
      const size = memoryValue(memory.data, memory.addressBitWidth, memory.dataBitWidth)
      this.data = size
      switch (memory.onStart) {
        case 'random':
          for (let i = 0; i < this.data.length; i++) {
            this.data[i] = Math.floor(Math.random() * 256)
          }
          break
        case 'zeros':
          break
        case 'ones':
          for (let i = 0; i < this.data.length; i++) this.data[i] = 0xff
          break
        case 'data':
          // ya cargado en `memoryValue` (base64)
          break
      }
    } else {
      // ROM
      this.data = memoryValue(memory.data, memory.addressBitWidth, memory.dataBitWidth)
    }
  }

  override evaluate(): boolean {
    if (this.inputData !== null && this.isWriteAllowed()) {
      this.writeCell()
    }
    return this.read()
  }

  private isWriteAllowed(): boolean {
    const state = this.circuitState.get(this.write)
    const allowed = state === this.writeOn && CircuitFunction.not(state) === this.oldWriteState
    this.oldWriteState = state
    return allowed
  }

  private writeCell(): void {
    const addr = this.readNumericState(this.address)
    const value = this.readNumericState(this.inputData!)
    setCellValue(this.data, this.dataBitWidth, addr, value)
  }

  private read(): boolean {
    const addr = this.readNumericState(this.address)
    const value = cellValue(this.data, this.dataBitWidth, addr)
    let changed = false
    for (let i = 0; i < this.outputData.length; i++) {
      const bitChanged = this.setResult(i, CircuitFunction.fromBool(((value >> i) & 1) !== 0))
      changed = bitChanged || changed
    }
    return changed
  }

  override get reportName(): string {
    return this.inputData !== null ? 'RAM' : 'ROM'
  }

  get value(): number {
    return cellValue(this.data, this.dataBitWidth, 0)
  }
}