/**
 * El motor de simulación mínimo (M1-13).
 *
 * Qué hace y qué no hace, para no llevarse a engaño:
 *
 * - **Sí** evalúa compuertas combinacionales, propaga valores por los cables y calcula el
 *   estado visual de cada dispositivo.
 * - **Sí** es estable con la realimentación: repite pasadas hasta que nada cambia, así que
 *   un biestable se asienta.
 * - **No** es el motor definitivo. Simula a pasos completos («todo el circuito a la vez»),
 *   sin colas de eventos ni retardos de propagación, y **no** detecta conflictos: si dos
 *   salidas pelean por el mismo cable, gana la última que escriba. Los retardos y el
 *   análisis temporal son M7B; el motor con eventos, M7.
 *
 * Trabaja sobre `Signal`, que es una **máscara de bits**. De momento todo es de 1 bit, pero
 * el tipo ya es el bueno para que los buses de M3B no obliguen a rehacerlo.
 *
 * ⚠️ Cuidado con los enteros de JavaScript: `1 << 32 === 1` (el desplazamiento se toma
 * módulo 32) y `0xffffffff` es un número positivo. Aquí se trabaja siempre con **enteros
 * sin signo**, así que las operaciones son `&`, `|` y `^` sobre valores ya enmascarados.
 */

import { deviceLayout, pinPosition } from '../model/layout'
import type { Button, DeviceState, Element, Gate, GridPoint, Id, Signal } from '../model/types'
import { Nets } from './nets'

/** Cuántas pasadas se le dan a la propagación antes de darse por vencido. */
const MAX_PASSES = 64

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
  private poweredFlag = true

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
    const nets = new Nets(elements.filter((element) => element.kind === 'wire'))
    const devices = elements.filter((element) => element.kind !== 'wire')
    const values = new Map<string, Signal>()

    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      let changed = false
      for (const device of devices) {
        const value = this.drive(device, nets, values)
        if (value === null) {
          continue
        }
        const point = outputPoint(device)
        if (point === null) {
          continue
        }
        const key = nets.netOf(point)
        if (values.get(key) !== value) {
          values.set(key, value)
          changed = true
        }
      }
      if (!changed) {
        break
      }
    }

    return {
      devices: this.deviceStates(devices, nets, values),
      nets: values,
      powered: this.poweredFlag,
    }
  }

  /** Lo que empuja un dispositivo a su cable de salida. `null` = no empuja nada. */
  private drive(
    device: Gate | Button,
    nets: Nets,
    values: ReadonlyMap<string, Signal>,
  ): Signal | null {
    if (device.kind === 'button') {
      return this.buttonValue(device)
    }

    switch (device.gateType) {
      case 'and':
        return this.negate(device, inputsAllOne(device, nets, values) ? 1 : 0)
      case 'or':
        return this.negate(device, inputsAnyOne(device, nets, values) ? 1 : 0)
      case 'xor':
        return this.negate(device, oddNumberOfOnes(device, nets, values) ? 1 : 0)
      case 'not':
        return this.negate(device, inputsAllOne(device, nets, values) ? 0 : 1)
      default:
        // El LED no tiene salida, y las compuertas que faltan llegan en M2.
        return null
    }
  }

  /** Aplica la negación de salida: así se hace una NAND con una AND. */
  private negate(gate: Gate, value: Signal): Signal {
    if (!gate.invertedOutput) {
      return value
    }
    return value === 1 ? 0 : 1
  }

  /**
   * Lo que vale un interruptor.
   *
   * Sale de `Function/FunctionButton.cs`: pulsado da 1, suelto da 0, y los dos se dan la
   * vuelta si el botón está invertido. Da igual que sea momentáneo o de los que se quedan:
   * el motor solo ve «pulsado o no», y quien decide qué significa soltar es el editor.
   */
  private buttonValue(button: Button): Signal {
    const on = this.pressed.get(button.id) ?? false
    return on !== button.inverted ? 1 : 0
  }

  /** El estado visual de cada dispositivo. */
  private deviceStates(
    devices: readonly (Gate | Button)[],
    nets: Nets,
    values: ReadonlyMap<string, Signal>,
  ): Map<Id, DeviceState> {
    const states = new Map<Id, DeviceState>()

    for (const device of devices) {
      if (!this.poweredFlag) {
        states.set(device.id, 'off')
        continue
      }

      // Un LED enseña lo que le llega; todo lo demás enseña lo que saca. El botón, lo suyo.
      let value: Signal | null
      if (device.kind === 'button') {
        value = this.buttonValue(device)
      } else {
        value = this.readPin(device, device.gateType === 'led' ? 'input' : 'output', nets, values)
      }

      states.set(device.id, value === 1 ? 'one' : 'zero')
    }

    return states
  }

  /** Lee el valor del primer pin del tipo indicado. */
  private readPin(
    device: Gate | Button,
    type: 'input' | 'output',
    nets: Nets,
    values: ReadonlyMap<string, Signal>,
  ): Signal | null {
    const layout = deviceLayout(device)
    const pin = layout.pins.find((candidate) => candidate.type === type)
    if (pin === undefined) {
      return null
    }
    const point = pinPosition(device.position, device.rotation, layout, pin)
    return values.get(nets.netOf(point)) ?? 0
  }
}

/** Dónde está el pin de salida de un dispositivo, en la rejilla. */
function outputPoint(device: Gate | Button): GridPoint | null {
  const layout = deviceLayout(device)
  const pin = layout.pins.find((candidate) => candidate.type === 'output')
  if (pin === undefined) {
    return null
  }
  return pinPosition(device.position, device.rotation, layout, pin)
}

/** Los valores que llegan a cada entrada de una compuerta. */
function inputValues(gate: Gate, nets: Nets, values: ReadonlyMap<string, Signal>): Signal[] {
  const layout = deviceLayout(gate)
  const result: Signal[] = []
  for (const pin of layout.pins) {
    if (pin.type !== 'input') {
      continue
    }
    const point = pinPosition(gate.position, gate.rotation, layout, pin)
    result.push(values.get(nets.netOf(point)) ?? 0)
  }
  return result
}

/** Un nodo sin nadie que lo empuje vale 0; por eso se compara siempre contra `=== 1`. */
function inputsAllOne(gate: Gate, nets: Nets, values: ReadonlyMap<string, Signal>): boolean {
  return inputValues(gate, nets, values).every((value) => value === 1)
}

function inputsAnyOne(gate: Gate, nets: Nets, values: ReadonlyMap<string, Signal>): boolean {
  return inputValues(gate, nets, values).some((value) => value === 1)
}

/** XOR de toda la vida: la salida es 1 si hay un número **impar** de entradas a 1. */
function oddNumberOfOnes(gate: Gate, nets: Nets, values: ReadonlyMap<string, Signal>): boolean {
  let ones = 0
  for (const value of inputValues(gate, nets, values)) {
    if (value === 1) {
      ones += 1
    }
  }
  return ones % 2 === 1
}
