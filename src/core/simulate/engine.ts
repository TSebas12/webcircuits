/**
 * El motor de simulación mínimo (M1-13).
 *
 * Qué hace y qué no hace, para no llevarse a engaño:
 *
 * - **Sí** evalúa compuertas combinacionales, propaga valores por los cables y calcula el
 *   estado visual de cada dispositivo, en **orden topológico** (`propagate.ts`), de modo
 *   que una cadena combinacional se asienta en una sola pasada.
 * - **Sí** es estable con la realimentación: repite pasadas hasta que nada cambia, así que
 *   un biestable se asienta.
 * - **No** es el motor definitivo. No guarda estado entre llamadas (no hay lista de sucios
 *   ni colas de eventos), **no** hay retardos de propagación y **no** detecta conflictos:
 *   si dos salidas pelean por el mismo cable, gana la última que escriba. Los retardos y el
 *   análisis temporal son M7B; el motor con eventos de verdad, M7.
 *
 * Lo que el motor **sí** recuerda entre llamadas es lo único que no se puede deducir del
 * circuito: qué interruptores están pulsados y si la corriente está puesta.
 */

import type { DeviceState, Element, Id, Signal } from '../model/types'
import { evaluateCircuit } from './propagate'

/** Lo que hay que saber para pintar el circuito en un instante dado. */
export interface SimulationState {
  /** Estado de cada dispositivo, por id. */
  readonly devices: ReadonlyMap<Id, DeviceState>
  /**
   * Valor de cada nodo eléctrico, por clave de punto.
   *
   * ⚠️ Solo aparecen los nodos que alguien empuja: un nodo del que nadie escribe **no
   * está** en el mapa, y leerlo tiene que dar 0. Es la misma convención que se usa dentro
   * del motor (de ahí los `?? 0`), y evita tener que enumerar los nodos vacíos.
   */
  readonly nets: ReadonlyMap<string, Signal>
  /** ¿Está encendido el circuito? (original: `Power`, el Ctrl+W). */
  readonly powered: boolean
}

/** Un estado vacío: el circuito apagado y sin nada calculado. */
export function emptySimulationState(): SimulationState {
  return { devices: new Map(), nets: new Map(), powered: false }
}

export class MiniEngine {
  /** Qué interruptores están pulsados. Es lo único que el motor recuerda del usuario. */
  private readonly pressed = new Map<Id, boolean>()

  /**
   * ¿Está encendido el circuito?
   *
   * ⚠️ Nace **apagado**, y es fiel al original: allí `Editor.Power` se define como
   * `CircuitRunner != null` (`Editor/Editor.cs:46`), así que no hay corriente hasta que el
   * usuario la enciende, y `InEditMode` es `!Power`. La aplicación **abre en modo edición**,
   * con todo sin corriente; al cargar un fichero se apaga otra vez, explícitamente
   * (`Mainframe.File.cs:124`).
   */
  private poweredFlag = false

  /** ¿Está encendido el circuito? (original: menú Circuito → Encender, `Ctrl+W`). */
  get powered(): boolean {
    return this.poweredFlag
  }

  setPowered(value: boolean): void {
    this.poweredFlag = value
  }

  isPressed(id: Id): boolean {
    return this.pressed.get(id) ?? false
  }

  setPressed(id: Id, pressed: boolean): void {
    this.pressed.set(id, pressed)
  }

  /** Olvida los interruptores pulsados. Se llama al vaciar el circuito. */
  reset(): void {
    this.pressed.clear()
  }

  /**
   * Calcula el estado del circuito entero.
   *
   * Es una función pura sobre `elements` más lo que el motor recuerde de los
   * interruptores, así que se puede llamar tantas veces como haga falta: el coste es
   * proporcional al tamaño del circuito y no guarda nada entre llamadas.
   */
  evaluate(elements: readonly Element[]): SimulationState {
    const { values, deviceStates } = evaluateCircuit(elements, this.pressed, this.poweredFlag)
    return { devices: deviceStates, nets: values, powered: this.poweredFlag }
  }
}
