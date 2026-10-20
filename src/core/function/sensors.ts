/**
 * Sensores básicos (M2-12).
 *
 * Portado de `CircuitProject/Sensor.cs` y `Function/FunctionSensor.cs`. Un sensor es una
 * **fuente** de varios bits: no lee cables, produce un valor que cambia con el tiempo o con
 * la mano del usuario. Cada tipo tiene su propia forma de avanzar:
 *
 * - `series` / `loop`: una lista de puntos `tick:valor` en hexadecimal.
 * - `random`: un valor nuevo cada cierto número de ticks.
 * - `manual`: el usuario escribe el valor.
 * - `keycode` / `ascii`: el teclado escribe el valor.
 * - `sequence`: cuenta de 0 al máximo y vuelve a 0.
 * - `clock`: la hora del sistema codificada en BCD.
 *
 * La parte visual (el cuadro con el valor, los eventos del teclado) no está aquí: este
 * módulo solo produce los números que el motor escribe en sus resultados.
 */
import { CircuitFunction } from './circuit-function'
import type { CircuitState } from '../simulate/circuit-state'
import type { SensorType } from '../model/sensor'

// La lista canónica vive en el modelo, porque también la usan la paleta y el inspector.
export type { SensorType } from '../model/sensor'

export interface SensorConfig {
  readonly sensorType: SensorType
  readonly bitWidth: number
  readonly data: string
}

/** Un punto de una serie: en el tick `tick` el sensor vale `value`. */
export interface SensorPoint {
  readonly tick: number
  readonly value: number
}

export const DEFAULT_RANDOM_MIN_INTERVAL = 10
export const DEFAULT_RANDOM_MAX_INTERVAL = 20
export const DEFAULT_RANDOM_DATA = 'A:14'

/** Normaliza un entero al ancho de bits, como `Constant.Normalize`. */
export function normalize(value: number, bitWidth: number): number {
  const width = Math.max(1, Math.min(32, bitWidth))
  const modulus = 2 ** width
  const integer = Math.trunc(Number.isFinite(value) ? value : 0)
  return ((integer % modulus) + modulus) % modulus
}

/** `Sensor.TryParsePoint`: dos números hexadecimales separados por `:`. */
export function tryParsePoint(data: string, bitWidth: number): SensorPoint | null {
  const parts = data.split(':')
  if (parts.length !== 2) return null
  const tick = parseHex(parts[0] ?? '')
  const value = parseHex(parts[1] ?? '')
  if (tick === null || value === null) return null
  return { tick, value: normalize(value, bitWidth) }
}

function parseHex(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '' || !/^[0-9a-fA-F]+$/.test(trimmed)) return null
  const value = Number.parseInt(trimmed, 16)
  return Number.isFinite(value) ? value : null
}

/**
 * `Sensor.TryParseSeries`: puntos separados por espacios, con ticks estrictamente
 * crecientes. Una cadena vacía es una serie válida y vacía.
 */
export function tryParseSeries(data: string, bitWidth: number): SensorPoint[] | null {
  const result: SensorPoint[] = []
  let lastTick = -1
  for (const item of data.split(/\s+/)) {
    if (item === '') continue
    const point = tryParsePoint(item, bitWidth)
    if (point === null || point.tick <= lastTick) return null
    lastTick = point.tick
    result.push(point)
  }
  return result
}

/** `Sensor.SaveSeries`: vuelve a escribir la lista en el formato del original. */
export function saveSeries(points: readonly SensorPoint[]): string {
  return points
    .map((point) => `${point.tick.toString(16).toUpperCase()}:${point.value.toString(16).toUpperCase()}`)
    .join(' ')
}

/** La lógica común de todos los valores: guarda el valor normalizado y sabe avanzar. */
abstract class SensorValue {
  protected readonly bitWidth: number
  private current = 0

  protected constructor(bitWidth: number) {
    this.bitWidth = Math.max(1, Math.min(32, bitWidth))
  }

  get value(): number {
    return this.current
  }

  set value(value: number) {
    this.current = normalize(value, this.bitWidth)
  }

  abstract flip(): boolean
}

class RandomValue extends SensorValue {
  private readonly circuitState: CircuitState
  private readonly maxValue: number
  private readonly minTick: number
  private readonly maxTick: number
  private flipAt = 0
  private tick = 0

  constructor(data: string, bitWidth: number, circuitState: CircuitState) {
    super(bitWidth)
    this.circuitState = circuitState
    const point = tryParsePoint(data, 32)
    this.minTick = point !== null && point.tick > 0 ? point.tick : DEFAULT_RANDOM_MIN_INTERVAL
    this.maxTick = Math.max(this.minTick, point?.value ?? DEFAULT_RANDOM_MAX_INTERVAL)
    this.maxValue = bitWidth < 32 ? 2 ** bitWidth : 0x7fffffff
    this.reset()
    this.value = this.nextRandom(this.maxValue)
  }

  override flip(): boolean {
    if (this.flipAt !== this.tick) {
      this.tick += 1
      return false
    }
    this.reset()
    this.value = this.nextRandom(this.maxValue)
    return true
  }

  private reset(): void {
    // `Random.Next(min, max)` del original excluye el máximo. Si el rango es de un solo
    // tick, `nextRandom` ya devuelve 0 y el sensor cambia en ese tick.
    this.flipAt = this.minTick + this.nextRandom(this.maxTick - this.minTick)
    this.tick = 0
  }

  private nextRandom(max: number): number {
    return this.circuitState.nextRandom(Math.max(1, max))
  }
}

class SeriesValue extends SensorValue {
  private readonly list: readonly SensorPoint[]
  private readonly loop: boolean
  private index = 0
  private tick = 0
  private stop: boolean

  constructor(data: string, bitWidth: number, loop: boolean) {
    super(bitWidth)
    this.list = tryParseSeries(data, bitWidth) ?? []
    this.stop = this.list.length === 0
    this.loop = loop
  }

  override flip(): boolean {
    if (this.stop) return false
    const point = this.list[this.index]
    if (point === undefined || point.tick !== this.tick) {
      this.tick += 1
      return false
    }
    this.tick += 1
    this.value = point.value
    this.index += 1
    if (this.index >= this.list.length) {
      if (this.loop) {
        this.index = 0
        this.tick = 0
      } else {
        this.stop = true
      }
    }
    return true
  }
}

class ManualValue extends SensorValue {
  private lastValue: number

  constructor(data: string, bitWidth: number) {
    super(bitWidth)
    const parsed = parseHex(data)
    this.value = parsed ?? 0
    this.lastValue = this.value + 1
  }

  override flip(): boolean {
    if (this.lastValue !== this.value) {
      this.lastValue = this.value
      return true
    }
    return false
  }
}

class KeyboardValue extends SensorValue {
  private readonly sensor: FunctionSensor

  constructor(sensor: FunctionSensor) {
    super(sensor.bitWidth)
    this.sensor = sensor
  }

  setText(text: string): void {
    if (text === '') {
      this.value = 0
    } else {
      this.value = text.codePointAt(0) ?? 0
    }
    this.sensor.notifyChanged()
  }

  setKey(keyCode: number): void {
    this.value = keyCode
    this.sensor.notifyChanged()
  }

  override flip(): boolean {
    return false
  }
}

class SequenceValue extends SensorValue {
  private readonly maxValue: number

  constructor(bitWidth: number) {
    super(bitWidth)
    this.maxValue = bitWidth < 32 ? 2 ** bitWidth : 0x7fffffff
  }

  override flip(): boolean {
    this.value = Math.min(this.value + 1, this.maxValue)
    return true
  }
}

class ClockValue extends SensorValue {
  constructor(bitWidth: number) {
    super(bitWidth)
  }

  override flip(): boolean {
    const now = new Date()
    const value =
      (toDecimalBinary(now.getHours()) << 24) +
      (toDecimalBinary(now.getMinutes()) << 16) +
      (toDecimalBinary(now.getSeconds()) << 8) +
      toDecimalBinary(Math.floor(now.getMilliseconds() / 10))
    const next = normalize(value, this.bitWidth)
    if (next === this.value) return false
    this.value = next
    return true
  }
}

function toDecimalBinary(value: number): number {
  return (((Math.floor(value / 10) % 10) << 4) + (value % 10))
}

/** Un sensor: produce un valor de `bitWidth` bits y avanza cuando el reloj lo pide. */
export class FunctionSensor extends CircuitFunction {
  invalid = false
  readonly sensorType: SensorType
  readonly bitWidth: number
  private readonly sensorValue: SensorValue

  constructor(circuitState: CircuitState, config: SensorConfig, result: number[]) {
    super(circuitState, null, result)
    this.sensorType = config.sensorType
    // El ancho lógico lo manda la pieza (`Sensor.BitWidth`). En el modelo real coincide con
    // `result.length`; los tests construyen un solo resultado y aun así quieren probar 2 bits.
    this.bitWidth = Math.max(1, Math.min(32, config.bitWidth))
    switch (config.sensorType) {
      case 'series':
        this.sensorValue = new SeriesValue(config.data, config.bitWidth, false)
        break
      case 'loop':
        this.sensorValue = new SeriesValue(config.data, config.bitWidth, true)
        break
      case 'random':
        this.sensorValue = new RandomValue(config.data, config.bitWidth, circuitState)
        break
      case 'manual':
        this.sensorValue = new ManualValue(config.data, config.bitWidth)
        break
      case 'keycode':
      case 'ascii':
        this.sensorValue = new KeyboardValue(this)
        break
      case 'sequence':
        this.sensorValue = new SequenceValue(config.bitWidth)
        break
      case 'clock':
        this.sensorValue = new ClockValue(config.bitWidth)
        break
    }
  }

  get value(): number {
    return this.sensorValue.value
  }

  /** Cambia el valor a mano (sensores `manual`, `keycode` y `ascii`). */
  setValue(value: number): void {
    this.sensorValue.value = value
    this.notifyChanged()
  }

  /** Escribe texto en un sensor ASCII. */
  setText(text: string): void {
    if (this.sensorValue instanceof KeyboardValue) {
      this.sensorValue.setText(text)
    }
  }

  /** Escribe un código de tecla en un sensor KeyCode. */
  setKey(keyCode: number): void {
    if (this.sensorValue instanceof KeyboardValue) {
      this.sensorValue.setKey(keyCode)
    }
  }

  flip(): boolean {
    return this.sensorValue.flip()
  }

  /** Marca el sensor como sucio para que la siguiente evaluación lo lea. */
  notifyChanged(): void {
    this.invalid = true
    this.circuitState.markUpdated(this)
  }

  override evaluate(): boolean {
    if (this.setResultInt(this.value)) {
      this.invalid = true
      return true
    }
    return false
  }

  override get reportName(): string {
    return 'Sensor'
  }
}
