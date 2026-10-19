/**
 * Propagación de señales por el circuito (M2-10 y M2-11).
 *
 * La diferencia con evaluar «a lo bruto» es el **orden**: los dispositivos se recorren en
 * orden topológico (`levelize`), así que una cadena combinacional se asienta en **una sola
 * pasada** en vez de en tantas como saltos tenga. La realimentación (un biestable, un
 * anillo) no tiene orden topológico, y para eso quedan las pasadas de repetición: se
 * siguen dando vueltas hasta que nada cambia, que es lo que hacía el motor de M1.
 *
 * El original consigue lo mismo con una **lista de sucios** (`CircuitState.DirtyList`):
 * solo re-evalúa lo que alguna vez se marcó como cambiado. Aquí el orden topológico hace
 * ese papel sin tener que mantener estado entre llamadas — el motor sigue siendo una
 * función pura de los elementos y de los interruptores pulsados.
 *
 * Trabaja sobre `Signal`, que es una **máscara de bits**: hoy todo es de 1 bit, pero el
 * tipo ya es el bueno para que los buses de M3B no obliguen a rehacerlo.
 */

import { deviceLayout, pinPosition } from '../model/layout'
import type {
  Button,
  DeviceState,
  Element,
  Gate,
  GridPoint,
  Id,
  Signal,
  Wire,
} from '../model/types'
import { levelize } from './levelize'
import { Nets } from './nets'

/** Cuántas pasadas se le dan a la realimentación antes de darse por vencido. */
const MAX_PASSES = 64

/** Lo que sale de evaluar un circuito: valores de los nodos y estado visual de cada dispositivo. */
export interface EvaluatedCircuit {
  /**
   * Valor de cada nodo eléctrico, por clave de punto.
   *
   * ⚠️ Solo aparecen los nodos que alguien empuja: un nodo del que nadie escribe **no
   * está** en el mapa, y leerlo tiene que dar 0. Es la convención de todo el motor y evita
   * enumerar los nodos vacíos.
   */
  readonly values: ReadonlyMap<string, Signal>
  /** Estado visual de cada dispositivo, por id. */
  readonly deviceStates: ReadonlyMap<Id, DeviceState>
}

/**
 * Evalúa el circuito entero.
 *
 * Con la corriente apagada no se calcula nada: todo queda apagado y sin nodos, que es como
 * se abre la aplicación (modo edición).
 */
export function evaluateCircuit(
  elements: readonly Element[],
  pressed: ReadonlyMap<Id, boolean>,
  powered: boolean,
): EvaluatedCircuit {
  const values = new Map<string, Signal>()
  const deviceStates = new Map<Id, DeviceState>()
  const devices = elements.filter(
    (element): element is Gate | Button => element.kind === 'gate' || element.kind === 'button',
  )

  if (!powered) {
    for (const device of devices) {
      deviceStates.set(device.id, 'off')
    }
    return { values, deviceStates }
  }

  const nets = new Nets(elements.filter((element): element is Wire => element.kind === 'wire'))
  // En orden topológico: las cadenas combinacionales caen en la primera pasada, y las
  // vueltas extra solo sirven para la realimentación.
  const order = levelize(elements)

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let changed = false
    for (const device of order) {
      const value = drive(device, nets, values, pressed)
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

  for (const device of devices) {
    // Un LED enseña lo que le llega; todo lo demás enseña lo que saca. El botón, lo suyo.
    const value =
      device.kind === 'button'
        ? buttonValue(device, pressed)
        : readPin(device, device.gateType === 'led' ? 'input' : 'output', nets, values)
    deviceStates.set(device.id, value === 1 ? 'one' : 'zero')
  }

  return { values, deviceStates }
}

/** Lo que empuja un dispositivo a su cable de salida. `null` = no empuja nada. */
function drive(
  device: Gate | Button,
  nets: Nets,
  values: ReadonlyMap<string, Signal>,
  pressed: ReadonlyMap<Id, boolean>,
): Signal | null {
  if (device.kind === 'button') {
    return buttonValue(device, pressed)
  }

  switch (device.gateType) {
    case 'and':
      return negate(device, inputsAllOne(device, nets, values) ? 1 : 0)
    case 'or':
      return negate(device, inputsAnyOne(device, nets, values) ? 1 : 0)
    case 'xor':
      return negate(device, oddNumberOfOnes(device, nets, values) ? 1 : 0)
    case 'not':
      return negate(device, inputsAllOne(device, nets, values) ? 0 : 1)
    default:
      // El LED no tiene salida, y las compuertas que faltan llegan en M2.
      return null
  }
}

/** Aplica la negación de salida: así se hace una NAND con una AND. */
function negate(gate: Gate, value: Signal): Signal {
  if (!gate.invertedOutput) {
    return value
  }
  return value === 1 ? 0 : 1
}

/**
 * Lo que vale un interruptor. Sale de `Function/FunctionButton.cs`: pulsado da 1, suelto da
 * 0, y los dos se dan la vuelta si el botón está invertido. Da igual que sea momentáneo o
 * de los que se quedan: el motor solo ve «pulsado o no».
 */
function buttonValue(button: Button, pressed: ReadonlyMap<Id, boolean>): Signal {
  const on = pressed.get(button.id) ?? false
  return on !== button.inverted ? 1 : 0
}

/** Lee el valor del primer pin del tipo indicado. */
function readPin(
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
