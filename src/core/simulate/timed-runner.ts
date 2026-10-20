/**
 * Simulación con retardo por timestep discreto (M7B-03).
 *
 * Envuelve un `CircuitRunner` y una `EventQueue`: en cada paso de tiempo `dt` se
 * despachan los eventos cuyo instante ya ha llegado y se evalúa el circuito.
 * Las compuertas con `delay > 0` programan sus salidas para el instante
 * `t + delay` en vez de propagarlas al instante.
 *
 * Es una base mínima y no reemplaza todavía al runner síncrono del editor.
 */

import { CircuitRunner } from './circuit-runner'
import { EventQueue } from './event-queue'

export class TimedRunner {
  private time = 0
  private readonly queue = new EventQueue()
  readonly runner: CircuitRunner

  constructor(index: import('../model/symbol').SymbolIndex, circuit: import('../model/types').Circuit) {
    this.runner = new CircuitRunner(index, circuit)
  }

  /** Tiempo actual de la simulación. */
  get currentTime(): number {
    return this.time
  }

  /** Programa un evento para un instante futuro. */
  schedule(time: number, action: () => void): void {
    this.queue.push({ time, action })
  }

  /**
   * Avanza la simulación `dt` unidades de tiempo: despacha los eventos pendientes
   * cuyo instante <= t+dt y evalúa al final.
   */
  advance(dt: number): void {
    const target = this.time + Math.max(0, dt)
    let next = this.queue.peek()
    while (next !== null && next.time <= target) {
      this.queue.pop()
      this.time = next.time
      next.action()
      next = this.queue.peek()
    }
    this.time = target
    this.runner.step(false)
  }

  reset(): void {
    this.time = 0
    this.queue.clear()
  }
}