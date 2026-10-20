/**
 * Tipos de sensor y sus datos por defecto (original: `CircuitProject/Sensor.cs`).
 *
 * El modelo guarda el tipo como `string` para no acoplar la persistencia al motor, pero la
 * lista canónica vive aquí: la usan el editor (inspector y paleta), la importación XML y el
 * propio `Diagram` al colocar una pieza. Así no hay dos listas de tipos que se puedan
 * desincronizar.
 */

/** Los tipos del original (`SensorType.cs`), en su orden. */
export const SENSOR_TYPES = [
  'series',
  'loop',
  'random',
  'manual',
  'keycode',
  'ascii',
  'sequence',
  'clock',
] as const

export type SensorType = (typeof SENSOR_TYPES)[number]

/** `Sensor.DefaultSeriesData`: un punto en el tick 0 con valor 0. */
export const DEFAULT_SERIES_DATA = '0:0'

/** `Sensor.DefaultRandomData`: cambia cada 10..20 ticks (hexadecimal). */
export const DEFAULT_RANDOM_DATA = 'A:14'

/** ¿El texto es uno de los tipos que conocemos? */
export function isSensorType(value: string): value is SensorType {
  return (SENSOR_TYPES as readonly string[]).includes(value)
}

/**
 * Los datos con los que nace un sensor de ese tipo.
 *
 * Los tipos que no usan `Data` (manual, teclado, secuencia y reloj) arrancan vacíos, como en
 * el original. Una serie nace con `0:0` y un aleatorio con `A:14`.
 */
export function defaultSensorData(type: SensorType): string {
  switch (type) {
    case 'series':
    case 'loop':
      return DEFAULT_SERIES_DATA
    case 'random':
      return DEFAULT_RANDOM_DATA
    default:
      return ''
  }
}
