/**
 * Los dispositivos que se simulan pero no son compuertas: reloj, interruptor, LED y
 * constante.
 *
 * Portado de `Function/FunctionClock.cs`, `Function/FunctionButton.cs`,
 * `Function/FunctionLed.cs` y `Function/FunctionConstant.cs`. Los cuatro tienen forma y se
 * colocan desde la paleta; el mismo `FunctionLed` hace de indicador del altavoz.
 *
 * ⚠️ **Cómo se dibujan.** En el original estas funciones *son* también la vista: guardan el
 * `Shape`/`Border` de WPF y lo pintan (`Redraw`). Aquí no hay WPF: el lienzo se pinta desde
 * una foto del estado (`SimulationState`), así que `turnOn`/`turnOff`/`redraw` solo llevan
 * la **cuenta de lo que hay que repintar** (`invalid`) y el dibujado real lo hace el
 * render con los índices que estas funciones exponen vía `CircuitMap`. Es la misma división
 * que ya se eligió para todo el render, y por eso la clase no guarda ninguna referencia a la
 * vista.
 */

import { CircuitFunction, OneBitConst, Probe } from './circuit-function'
import type { CircuitState } from '../simulate/circuit-state'
import type { IFunctionClock, IFunctionVisual } from './interfaces'
import { State } from './state'

/**
 * El reloj: saca un valor que **se voltea** cada medio periodo.
 *
 * No tiene parámetros: es la única fuente de tiempo del circuito. Va en la lista de
 * `flip` del estado (`CircuitState.defineFunction` lo detecta por el método `flip`), que es
 * quien decide cuándo se le llama.
 */
export class FunctionClock extends CircuitFunction implements IFunctionClock {
  private value = false

  constructor(circuitState: CircuitState, result: number) {
    super(circuitState, null, [result])
  }

  /** Voltea el pulso. Devolver `true` significa «algo ha cambiado». */
  flip(): boolean {
    this.value = !this.value
    return true
  }

  override evaluate(): boolean {
    return this.setResult0(CircuitFunction.fromBool(this.value))
  }

  override get reportName(): string {
    return 'Clock'
  }
}

/**
 * Un interruptor: mantiene su propio valor y el usuario lo cambia.
 *
 * Es de un solo bit (extiende `OneBitConst`), así que se comparta como una fuente: escribe
 * su estado y nada lo escribe a él. Dos detalles del original que conviene no perder:
 *
 * - nace en `On0` (un 0 lógico) y, si es **negado**, se pone en `On1`;
 * - uno **no** de tipo conmutador vuelve a su estado de reposo al soltarlo, mientras que el
 *   conmutador se queda como estaba (`StateChangedAction`).
 */
export class FunctionButton extends OneBitConst implements IFunctionVisual {
  /** Lo pone el dibujado: avisa de que hay que repintarlo. */
  invalid = false

  constructor(
    circuitState: CircuitState,
    private readonly isToggle: boolean,
    private readonly inverted: boolean,
    result: number,
  ) {
    super(circuitState, State.On0, result)
    if (inverted) {
      this.setState(State.On1)
    }
  }

  override get reportName(): string {
    return 'Button'
  }

  /**
   * El usuario pulsó o soltó el botón (original: `StateChangedAction`).
   *
   * `symbol` e `isPressed` vienen de la vista; aquí solo importa el segundo.
   */
  stateChanged(isPressed: boolean): void {
    if (isPressed) {
      if (this.isToggle) {
        this.setState(CircuitFunction.not(this.State))
        this.invalid = true
      } else {
        this.setState(this.inverted ? State.On0 : State.On1)
      }
    } else if (!this.isToggle) {
      this.setState(this.inverted ? State.On1 : State.On0)
    }
  }

  turnOn(): void {
    // Nada que hacer: el interruptor se engancha a la vista al dibujarse.
  }

  turnOff(): void {
    // Nada que hacer: ver `turnOn`.
  }

  redraw(): void {
    // El repintado lo hace el render leyendo el estado.
  }
}

/**
 * Un LED: no calcula nada, solo **mira** lo que llega a su pin.
 *
 * Extiende `Probe` (la base de las sondas), así que su `evaluate` no propaga: copia su
 * parámetro a su propio array de estado y avisa de que hay que repintar si cambió. Ojo a la
 * vuelta: el original devuelve `false` **siempre**, aunque cambie — no es una compuerta, y
 * devolver `true` haría que el motor volviera a evaluar por una luz.
 */
export class FunctionLed extends Probe implements IFunctionVisual {
  invalid = false

  constructor(circuitState: CircuitState, parameter: number | number[]) {
    super(circuitState, Array.isArray(parameter) ? parameter : [parameter])
  }

  override get reportName(): string {
    return 'Led'
  }

  override evaluate(): boolean {
    if (this.getState()) {
      this.invalid = true
    }
    return false
  }

  turnOn(): void {
    // El encendido lo pinta el render.
  }

  turnOff(): void {
    this.invalid = true
  }

  redraw(): void {
    // El repintado lo hace el render leyendo el estado.
  }
}

/**
 * Una constante: saca siempre el mismo valor, que viene de la pieza.
 *
 * El valor se puede **cambiar en marcha**, como en el original (`FunctionConstant.Value`).
 * Lo necesita la tabla de verdad: cada fila fuerza los pines de entrada y vuelve a evaluar
 * sobre el mismo aplanado, en vez de reconstruir el circuito entero por fila. Al cambiarlo
 * se marca la función como sucia para que `CircuitState.Evaluate` la vuelva a ejecutar.
 */
export class FunctionConstant extends CircuitFunction implements IFunctionVisual {
  invalid = false
  private currentValue: number

  constructor(
    circuitState: CircuitState,
    value: number,
    result: number[],
  ) {
    super(circuitState, null, result)
    this.currentValue = FunctionConstant.normalize(value, result.length)
    // Tracer.Assert(result.length === bitWidth de la pieza)
  }

  /** El valor normalizado al ancho de la constante. */
  get value(): number {
    return this.currentValue
  }

  set value(value: number) {
    const normalized = FunctionConstant.normalize(value, this.results.length)
    if (normalized !== this.currentValue) {
      this.currentValue = normalized
      this.circuitState.markUpdated(this)
      this.invalid = true
    }
  }

  private static normalize(value: number, bitWidth: number): number {
    const width = Math.max(1, Math.min(32, bitWidth))
    const modulus = 2 ** width
    const integer = Math.trunc(Number.isFinite(value) ? value : 0)
    return ((integer % modulus) + modulus) % modulus
  }

  override get reportName(): string {
    return 'Constant'
  }

  override evaluate(): boolean {
    return this.setResultInt(this.currentValue)
  }

  turnOn(): void {
    // Nada que hacer: la constante no cambia sola.
  }

  turnOff(): void {
    this.invalid = true
  }

  redraw(): void {
    // El repintado lo hace el render leyendo el estado.
  }
}
