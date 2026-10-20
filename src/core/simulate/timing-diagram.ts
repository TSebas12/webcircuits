/**
 * Diagrama de tiempo con retardos (M7B-06).
 *
 * Estructura de datos para muestras temporizadas de una señal.
 */

export interface TimedSample {
  readonly time: number
  readonly value: 0 | 1
}

export class TimingDiagram {
  private samples: TimedSample[] = []

  add(time: number, value: 0 | 1): void {
    this.samples.push({ time, value })
    this.samples.sort((a, b) => a.time - b.time)
  }

  get samplesList(): readonly TimedSample[] {
    return this.samples
  }

  clear(): void {
    this.samples = []
  }

  /** Valor de la señal en un instante dado (última muestra <= time). */
  valueAt(time: number): 0 | 1 | null {
    let result: 0 | 1 | null = null
    for (const s of this.samples) {
      if (s.time <= time) result = s.value
      else break
    }
    return result
  }
}