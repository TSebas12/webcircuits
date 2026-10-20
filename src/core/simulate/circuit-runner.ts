/**
 * El que enciende y apaga el circuito (portado de `Runner/CircuitRunner.cs`).
 *
 * En el original esto es un objeto con **dos hilos**: uno evalúa el circuito sin parar y otro
 * repinta lo que se ve. Aquí no hay hilos, y a propósito: el motor web evalúa en el hilo
 * principal (o en un *worker*, que llega con M7) y lo que este módulo conserva es la
 * **máquina de estados** del original, que es lo que de verdad importa:
 *
 * 1. encender = aplanar el circuito (`apply`), enganchar los indicadores (`turnOn`) y dejar
 *    un volteo de reloj pendiente;
 * 2. cada vuelta de reloj añade un volteo pendiente (`clockTick` = `TimerTick`);
 * 3. la vuelta de evaluación (`step` = el cuerpo de `RunCircuit`) voltea el reloj si hay
 *    algo pendiente, evalúa y avisa si el circuito entra en oscilación;
 * 4. apagar desengancha los indicadores de todo el árbol (`turnOff`).
 *
 * ⚠️ **Lo que aquí no está, y por qué.** El original mide el tiempo con un `PreciseTimer` de
 * milisegundos y ajusta la frecuencia real de la simulación (`actualFrequency`); eso es el
 * reloj determinista, que es M7B-05, y su sitio no es el port del motor sino el de la
 * temporización. Las probetas ya guardan sus `HistorySize` muestras y reciben su tick en
 * `step`; el osciloscopio que las pinta vive en la capa de interfaz.
 */

import { CircuitMap } from './circuit-map'
import type { CircuitState } from './circuit-state'
import type { Circuit } from '../model/types'
import type { SymbolIndex } from '../model/symbol'

/**
 * Cuántas muestras guarda cada probeta (original: `CircuitRunner.HistorySize`).
 *
 * Vale para dos cosas: es la capacidad que se le da al `CircuitState` al aplanar y es la
 * memoria del osciloscopio. Aquí solo se usa la primera; la segunda llega con M2-12.
 */
export const HISTORY_SIZE = 100

/** Medio periodo de un reloj a esa frecuencia, en milisegundos (original: `HalfPeriod`). */
export function halfPeriod(frequency: number): number {
  return Math.floor(500 / frequency)
}

export class CircuitRunner {
  private readonly map: CircuitMap
  private state: CircuitState | null = null
  private running = false

  /**
   * Volteos de reloj pendientes (original: `flipCount`).
   *
   * Es el contador que sincroniza el reloj con la evaluación: el temporizador suma y el
   * bucle resta. Cuando llega a cero y no se va a velocidad máxima, el original **espera**;
   * aquí simplemente no hay nada que voltear.
   */
  private flipCount = 0

  private probes = false

  constructor(index: SymbolIndex, circuit: Circuit) {
    this.map = CircuitMap.create(index, circuit)
  }

  /** El mapa del circuito que se está simulando (original: `RootMap`). */
  get circuitMap(): CircuitMap {
    return this.map
  }

  /** El estado de la simulación, o `null` si está apagado. */
  get circuitState(): CircuitState | null {
    return this.state
  }

  get isRunning(): boolean {
    return this.running && this.state !== null
  }

  /**
   * Volteos de reloj pendientes (original: el `flipCount` que consulta el bucle).
   *
   * Quien lleva el temporizador lo mira para **ponerse al día**: si el navegador se ha
   * saltado avisos, aquí es donde se ve cuántos.
   */
  get pendingFlips(): number {
    return this.flipCount
  }

  /**
   * ¿Hay probetas en el circuito? (original: `HasProbes`).
   *
   * Lo dice el estado al aplanar: es lo que decide si hay que abrir el osciloscopio y si
   * `step` tiene que avanzar el historial de las probetas.
   */
  get hasProbes(): boolean {
    return this.probes
  }

  /**
   * Enciende el circuito (original: `Run` hasta el `TurnOn`).
   *
   * Aplana —que es donde se decide qué es una función y qué no— y engancha los indicadores.
   * Deja **un** volteo pendiente: al encender, el reloj da su primer medio periodo.
   */
  turnOn(): CircuitState {
    const state = this.map.apply(HISTORY_SIZE)
    this.state = state
    this.probes = state.hasProbes
    this.flipCount = 1
    this.running = true
    this.map.turnOn()
    return state
  }

  /**
   * Apaga el circuito (original: el final de `Run`).
   *
   * Apaga los indicadores de **todo** el árbol, no solo de la hoja que se ve: apagar la
   * corriente apaga los subcircuitos también.
   */
  turnOff(): void {
    this.running = false
    this.map.turnOff()
  }

  /**
   * Una vuelta del bucle de evaluación (original: el cuerpo de `RunCircuit`).
   *
   * Devuelve `false` si el circuito **oscila**: el estado deja de evaluar cuando no se
   * asienta en unos pocos intentos, y el original avisa al usuario. No es un error del
   * programa sino del circuito (un lazo realimentado sin biestable que lo estabilice).
   */
  step(isMaximumSpeed: boolean): boolean {
    const state = this.state
    if (!this.running || state === null) {
      // Apagado no se evalúa: en el original el bucle entero vive dentro de
      // `while(!this.abortRequested)`.
      return true
    }
    const flipClock = 0 < this.flipCount
    if (!state.evaluate(isMaximumSpeed || flipClock)) {
      return false
    }
    if (this.probes && flipClock) {
      state.tickProbes()
    }
    if (!isMaximumSpeed) {
      this.flipCount = Math.max(0, this.flipCount - 1)
    }
    return true
  }

  /** El reloj ha cumplido medio periodo (original: `TimerTick`). */
  clockTick(): void {
    this.flipCount += 1
  }

  /**
   * Repinta lo que lo necesite (original: `RefreshUI`).
   *
   * En el original esto ocurre en el hilo de refresco, con `AdministratorIdle` por medio;
   * aquí lo llama el dibujado cuando le toca.
   */
  redraw(force = false): void {
    this.map.redraw(force)
  }
}
