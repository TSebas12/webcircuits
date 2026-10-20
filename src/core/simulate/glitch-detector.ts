/**
 * Detección de glitches / carreras (M7B-04).
 *
 * Registra transiciones de una señal y marca como glitch cuando aparecen
 * más de una transición dentro de una ventana de tiempo (delta).
 */

export interface Glitch {
  readonly time: number
  readonly transitions: number
}

export class GlitchDetector {
  private readonly window: number
  private history: number[] = []

  constructor(window = 1) {
    this.window = Math.max(0, window)
  }

  /** Registra una transición en el instante `time`. Devuelve el glitch si se detecta. */
  record(time: number): Glitch | null {
    this.history.push(time)
    // Mantén solo las transiciones dentro de la ventana.
    const cutoff = time - this.window
    this.history = this.history.filter((t) => t >= cutoff)
    if (this.history.length >= 3) {
      return { time, transitions: this.history.length }
    }
    return null
  }

  reset(): void {
    this.history = []
  }
}