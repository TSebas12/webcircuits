/**
 * Mantiene el circuito del documento en marcha.
 *
 * Es el pegamento entre el documento (una lista plana de elementos) y el motor de verdad:
 * construye el índice de símbolos, enciende el circuito con el `CircuitRunner` y traduce su
 * estado a la foto que el render sabe pintar (`devicesSnapshot`). Vive en `app/` y no en
 * `core/` a propósito: es el único sitio de esta pieza que necesita el navegador (el
 * temporizador del reloj y el fotograma en el que se repinta), y el núcleo tiene prohibido
 * tocarlo (`architecture.test.ts`).
 *
 * **Cuándo se aplana y cuándo no.** Aplanar (`CircuitMap.apply`) es lo caro: recorre el
 * circuito entero, resuelve los cables y reparte índices de estado. Se hace **al encender** y
 * cuando cambia la forma del documento, no en cada vuelta: una vuelta normal solo evalúa lo
 * que esté sucio (`CircuitState` lleva su lista). Por eso `evaluate` compara una **firma**
 * del documento —los identificadores de sus elementos— antes de rehacer nada.
 *
 * ⚠️ **La memoria de los interruptores se tira al encender.** Es fiel al original: al dar
 * corriente se crean funciones nuevas (`CircuitMap.Apply` → `DefineButton` → `new
 * FunctionButton`), y el estado de un interruptor solo vive en su función. Un conmutador que
 * estaba puesto vuelve a su sitio al apagar y encender.
 */

import { CircuitRunner, halfPeriod } from '../core/simulate/circuit-runner'
import { devicesSnapshot } from '../core/simulate/snapshot'
import { circuitIndex, type SymbolIndex } from '../core/model/symbol'
import { FunctionButton } from '../core/function/devices'
import { FunctionProbe } from '../core/function/probes'
import { State } from '../core/function/state'
import { CircuitError } from '../core/circuit-error'
import type { Circuit, DeviceState, Id, Signal, StoredElement, Wire } from '../core/model/types'
import type { CircuitState } from '../core/simulate/circuit-state'
import type { SimulationState } from '../core/simulate/engine'

/**
 * El identificador de la hoja que el editor está editando.
 *
 * El editor todavía trabaja sobre una sola hoja; los subcircuitos se colocan con M6, y
 * entonces esto pasará a ser el circuito que se está mirando.
 */
export const MAIN_CIRCUIT_ID = 'main'

/**
 * Frecuencia del reloj, en hercios.
 *
 * El original la guarda en el proyecto y el usuario la cambia en los ajustes; eso es M11.
 * 100 Hz es el valor por defecto del original, y son 200 medios periodos por segundo, o sea
 * un volteo cada 5 ms.
 */
export const CLOCK_FREQUENCY = 100

/**
 * Cuántos medios periodos atrasados se ponen al día de una vez.
 *
 * Si el navegador se salta temporizadores (una pestaña de fondo, una carga pesada), el reloj
 * se quedaría atrás. El original los recupera todos en un bucle apretado; aquí se ponen al
 * día unos pocos y se descarta el resto, porque la alternativa es congelar la pestaña para
 * siempre con tal de no perder un pulso de un reloj.
 */
const MAX_CATCH_UP = 4

/** Una señal del osciloscopio: una probeta y uno de sus bits. */
export interface ProbeChannel {
  readonly label: string
  readonly samples: readonly number[]
}

export interface SimulationCallbacks {
  /**
   * El circuito que corre ha cambiado: hay que repintar.
   *
   * Se avisa como mucho una vez por fotograma, porque un reloj a 100 Hz cambia doscientas
   * veces por segundo y repintar doscientas veces por segundo no lo hace nadie.
   */
  readonly onRefresh?: () => void
  /** El circuito no se puede simular (o no se asienta). */
  readonly onError?: (message: string) => void
}

export class Simulation {
  /** Qué interruptores están pulsados ahora mismo. */
  private readonly pressed = new Map<Id, boolean>()

  private poweredFlag = false
  private runner: CircuitRunner | null = null
  private index: SymbolIndex | null = null
  private state: CircuitState | null = null

  /** La función de cada interruptor y si está negado, por identificador. */
  private readonly buttons = new Map<Id, FunctionButton>()
  private readonly inverted = new Map<Id, boolean>()

  /** La firma del documento que se aplanó, para saber cuándo hay que rehacerlo. */
  private signature = ''
  private elements: readonly StoredElement[] = []

  private clockTimer: ReturnType<typeof setInterval> | null = null
  private refreshFrame: number | null = null

  private frequency = CLOCK_FREQUENCY
  private pausedFlag = false

  private devices: ReadonlyMap<Id, DeviceState> = new Map()
  private lastError: string | null = null

  constructor(private readonly callbacks: SimulationCallbacks = {}) {}

  get powered(): boolean {
    return this.poweredFlag
  }

  /** El último problema del circuito, o `null` si todo va bien. */
  get error(): string | null {
    return this.lastError
  }

  /** Lo que hay que pintar ahora mismo. */
  get snapshot(): SimulationState {
    return { devices: this.devices, nets: new Map<string, Signal>(), powered: this.poweredFlag }
  }

  /**
   * El valor de un cable, para la sonda: 1 si lleva corriente, 0 si no, o `null` si no se
   * puede saber (circuito apagado o cable sin conexión).
   *
   * ⚠️ **Los cables no tienen estado propio**: quien lo tiene son los bits de los símbolos a
   * los que tocan. Por eso se pregunta al mapa por los índices del cable y se lee el estado
   * por índice. Antes esto leía un mapa `nets` que siempre estaba vacío, así que la sonda
   * marcaba 0 siempre.
   */
  probeValue(wire: Wire): number | null {
    const state = this.state
    const runner = this.runner
    if (state === null || runner === null) {
      return null
    }
    const indexes = runner.circuitMap.stateIndexes(wire)
    if (indexes.length === 0) {
      return null
    }
    return state.get(indexes[0]!) === State.On1 ? 1 : 0
  }

  /**
   * Las señales que ven las probetas, listas para el osciloscopio.
   *
   * Cada bit de una probeta es un canal. Se leen del historial circular, que ya está en
   * orden cronológico; apagado o sin probetas devuelve una lista vacía.
   */
  get probeChannels(): readonly ProbeChannel[] {
    const state = this.state
    if (state === null) {
      return []
    }
    const channels: ProbeChannel[] = []
    let index = 0
    for (const probe of state.probes) {
      if (!(probe instanceof FunctionProbe)) {
        continue
      }
      index += 1
      const bits = Math.max(1, probe.bitWidth)
      for (let bit = 0; bit < bits; bit += 1) {
        const suffix = bits > 1 ? `[${bit}]` : ''
        const label = probe.label.trim() || `Sonda ${index}`
        channels.push({
          label: `${label}${suffix}`,
          samples: probe.read(bit).map((value) => (value === State.On1 ? 1 : 0)),
        })
      }
    }
    return channels
  }

  /** Vacía el historial de todas las probetas sin apagar el circuito. */
  clearProbes(): void {
    for (const probe of this.state?.probes ?? []) {
      if (probe instanceof FunctionProbe) {
        probe.clear()
      }
    }
    this.scheduleRefresh()
  }

  /**
   * Enciende o apaga el circuito.
   *
   * Al encender **no** se simula todavía: eso lo hace el `evaluate` que viene detrás, que es
   * donde se conoce el documento. Aquí solo se tira lo que hubiera del encendido anterior.
   */
  setPowered(powered: boolean): void {
    if (powered === this.poweredFlag) {
      return
    }
    this.poweredFlag = powered
    if (powered) {
      // Funciones nuevas, interruptores en su sitio (ver la nota de arriba).
      this.pressed.clear()
    } else {
      // El aviso era de lo que estaba corriendo; apagado, ya no se refiere a nada.
      this.lastError = null
    }
    this.drop()
  }

  get frequencyHz(): number {
    return this.frequency
  }

  get paused(): boolean {
    return this.pausedFlag
  }

  setFrequency(hz: number): void {
    const next = Number.isFinite(hz) && hz > 0 ? hz : CLOCK_FREQUENCY
    this.frequency = next
    if (this.clockTimer !== null) {
      this.stopClock()
      this.startClock()
    }
  }

  pause(): void {
    if (this.pausedFlag) return
    this.pausedFlag = true
    this.stopClock()
  }

  resume(): void {
    if (!this.pausedFlag) return
    this.pausedFlag = false
    this.startClock()
  }

  /** Avanza un tick manualmente (depuración paso a paso). */
  step(): boolean {
    const runner = this.runner
    const state = this.state
    if (runner === null || state === null || !this.poweredFlag) {
      return false
    }
    const previous = this.pausedFlag
    this.pausedFlag = true
    this.stopClock()
    runner.clockTick()
    let guard = 0
    while (runner.pendingFlips > 0 && guard < MAX_CATCH_UP) {
      guard += 1
      if (!runner.step(false)) {
        this.fail(new CircuitError('El circuito no se asienta: se queda oscilando.'))
        this.pausedFlag = previous
        return false
      }
    }
    const currentIndex = this.index
    const currentState = this.state
    if (currentIndex !== null && currentState !== null) {
      this.devices = devicesSnapshot(currentIndex, runner.circuitMap, currentState, this.elements)
      this.scheduleRefresh()
    }
    this.pausedFlag = previous
    if (!previous) this.startClock()
    return true
  }

  isPressed(id: Id): boolean {
    return this.pressed.get(id) ?? false
  }

  setPressed(id: Id, pressed: boolean): void {
    this.pressed.set(id, pressed)
    this.applyPress(id)
  }

  /** Olvida los interruptores y el circuito: se llama al vaciar el documento. */
  reset(): void {
    this.pressed.clear()
    this.drop()
  }

  /**
   * Recalcula el estado del circuito.
   *
   * Con la corriente apagada no se simula nada: todo queda apagado, que es como se abre la
   * aplicación y como se dibuja el modo edición.
   */
  evaluate(elements: readonly StoredElement[]): SimulationState {
    this.elements = elements

    if (!this.poweredFlag) {
      this.devices = allOff(elements)
      return this.snapshot
    }

    const signature = signatureOf(elements)
    if (this.runner === null || signature !== this.signature) {
      this.build(elements, signature)
    }

    const runner = this.runner
    const state = this.state
    if (runner === null || state === null) {
      this.devices = allOff(elements)
      return this.snapshot
    }

    // Una vuelta normal: evalúa lo sucio y devuelve la foto. Si la vuelta descubre que el
    // circuito oscila, `stepOnce` suelta el circuito, así que hay que volver a mirar.
    this.stepOnce(runner)
    const currentIndex = this.index
    const currentState = this.state
    if (currentIndex === null || currentState === null) {
      this.devices = allOff(elements)
      return this.snapshot
    }
    this.devices = devicesSnapshot(currentIndex, runner.circuitMap, currentState, elements)
    return this.snapshot
  }

  /** Para el reloj y suelta el circuito. Se llama al desmontar el editor. */
  dispose(): void {
    this.drop()
  }

  // ── Aplanar ──────────────────────────────────────────────────────────────────────────

  private build(elements: readonly StoredElement[], signature: string): void {
    this.drop()

    const circuit: Circuit = { id: MAIN_CIRCUIT_ID, name: 'Main', elements }
    try {
      const index = circuitIndex(circuit)
      const runner = new CircuitRunner(index, circuit)
      const state = runner.turnOn()

      this.index = index
      this.runner = runner
      this.state = state
      this.signature = signature
      this.lastError = null

      this.collectButtons(index, runner, state, elements)
      for (const id of this.pressed.keys()) {
        this.applyPress(id)
      }
      this.startClock()
    } catch (error) {
      // Un circuito que no se puede aplanar (un lazo, una pieza que todavía no se simula) se
      // avisa y se deja apagado: es lo que haría el original, que enseña el error. Se apunta
      // la firma para no intentarlo otra vez con el mismo documento: si el usuario lo
      // arregla, la firma cambia y se vuelve a probar.
      this.fail(error)
      this.signature = signature
    }
  }

  /**
   * Empareja cada interruptor del documento con su función.
   *
   * La función no sabe de qué pieza es (el original sí, porque guarda los `CircuitSymbol`),
   * así que se emparejan por el índice de estado que escriben: es el mismo que devuelve el
   * símbolo de la pieza.
   */
  private collectButtons(
    index: SymbolIndex,
    runner: CircuitRunner,
    state: CircuitState,
    elements: readonly StoredElement[],
  ): void {
    this.buttons.clear()
    this.inverted.clear()

    for (const element of elements) {
      if (element.kind !== 'button') {
        continue
      }
      this.inverted.set(element.id, element.inverted)

      const output = runner.circuitMap.symbolStateIndexes(index.symbol(element))[0]
      if (output === undefined) {
        continue
      }
      const function_ = state.functions.find((candidate) => candidate.results[0] === output)
      if (function_ instanceof FunctionButton) {
        this.buttons.set(element.id, function_)
      }
    }
  }

  /**
   * Pone el interruptor en la posición que le toca.
   *
   * El original solo sabe «me han pulsado» / «me han soltado» (`StateChangedAction`), que va
   * bien para un pulsador pero deja al conmutador al revés: el editor ya ha decidido **cuál**
   * es la posición nueva, así que se pone directamente. El resultado es el mismo y así un
   * conmutador no se voltea dos veces.
   */
  private applyPress(id: Id): void {
    const button = this.buttons.get(id)
    if (button === undefined) {
      return
    }
    const pressed = this.pressed.get(id) ?? false
    const inverted = this.inverted.get(id) ?? false
    button.setState(pressed !== inverted ? State.On1 : State.On0)
  }

  private stepOnce(runner: CircuitRunner): void {
    if (!runner.step(false)) {
      this.fail(
        new CircuitError(
          'El circuito no se asienta: se queda oscilando. Revisa las realimentaciones.',
        ),
      )
    }
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.lastError = message
    this.drop()
    this.callbacks.onError?.(message)
  }

  private drop(): void {
    this.stopClock()
    this.runner?.turnOff()
    this.runner = null
    this.state = null
    this.index = null
    this.signature = ''
    this.buttons.clear()
    this.inverted.clear()
    if (this.refreshFrame !== null) {
      cancelAnimationFrame(this.refreshFrame)
      this.refreshFrame = null
    }
  }

  // ── El reloj ─────────────────────────────────────────────────────────────────────────

  private startClock(): void {
    if (this.pausedFlag) return
    const state = this.state
    if (state === null || this.clockTimer !== null) {
      return
    }
    const hasClock = state.functions.some(
      (function_) => typeof (function_ as { flip?: unknown }).flip === 'function',
    )
    if (!hasClock) {
      return
    }
    // Un temporizador a la mitad del periodo: cada aviso es un medio periodo, y el reloj
    // voltea al evaluar. Es el `PreciseTimer` del original; el reloj determinista (con
    // medidas y frecuencia real) es M7B-05.
    this.clockTimer = setInterval(() => this.tickClock(), halfPeriod(CLOCK_FREQUENCY))
  }

  private stopClock(): void {
    if (this.clockTimer !== null) {
      clearInterval(this.clockTimer)
      this.clockTimer = null
    }
  }

  private tickClock(): void {
    const runner = this.runner
    const state = this.state
    if (runner === null || state === null || !this.poweredFlag) {
      this.stopClock()
      return
    }

    runner.clockTick()
    let guard = 0
    while (runner.pendingFlips > 0 && guard < MAX_CATCH_UP) {
      guard += 1
      if (!runner.step(false)) {
        this.fail(
          new CircuitError(
            'El circuito no se asienta: se queda oscilando. Revisa las realimentaciones.',
          ),
        )
        return
      }
    }

    this.devices = devicesSnapshot(this.index!, runner.circuitMap, state, this.elements)
    this.scheduleRefresh()
  }

  /** Pide un repintado, como mucho uno por fotograma. */
  private scheduleRefresh(): void {
    if (this.refreshFrame !== null) {
      return
    }
    this.refreshFrame = requestAnimationFrame(() => {
      this.refreshFrame = null
      this.callbacks.onRefresh?.()
    })
  }
}

/** Todos los dispositivos apagados: es lo que se ve con la corriente quitada. */
function allOff(elements: readonly StoredElement[]): Map<Id, DeviceState> {
  const devices = new Map<Id, DeviceState>()
  for (const element of elements) {
    if (element.kind !== 'wire') {
      devices.set(element.id, 'off')
    }
  }
  return devices
}

/**
 * Una firma del documento: si cambia, hay que volver a aplanar.
 *
 * Son los identificadores y el orden. No hace falta más: mover una pieza o cambiarle un
 * cable cambia lo que se simula, pero el editor no deja tocar nada con la corriente puesta
 * (y si algún día lo permite, la firma tiene que incluir la posición y los cables).
 */
function signatureOf(elements: readonly StoredElement[]): string {
  return elements.map((element) => element.id).join(',')
}
