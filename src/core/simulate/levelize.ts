/**
 * Nivelación del circuito: orden topológico de sus dispositivos (M2-10).
 *
 * Sirve para evaluar la parte combinacional en **una sola pasada**, en vez de iterar hasta
 * que nada cambie. Los dispositivos sin entradas (interruptores, relojes) van primero; el
 * resto va después de todo lo que alimenta sus entradas.
 *
 * Los ciclos (realimentación) no tienen orden topológico posible, así que se detectan y se
 * añaden al final. Eso es justo lo que hace falta para un circuito secuencial: el motor da
 * las pasadas de repetición que hagan falta y la realimentación se asienta con el valor de
 * la vuelta anterior.
 *
 * El original no tiene este paso: consigue lo mismo con la **lista de sucios** del
 * `CircuitState`. Aquí se prefiere un orden cacheable porque el motor no guarda estado
 * entre llamadas.
 */

import { deviceLayout, pinPosition } from '../model/layout'
import type { Button, Element, Gate, GridPoint, Wire } from '../model/types'
import { Nets } from './nets'

/** Los dispositivos que el circuito puede ordenar. */
export type Device = Gate | Button

/** Punto absoluto del primer pin de salida de un dispositivo, o `null` si no tiene. */
function outputPoint(device: Device): GridPoint | null {
  const layout = deviceLayout(device)
  const pin = layout.pins.find((candidate) => candidate.type === 'output')
  if (pin === undefined) {
    return null
  }
  return pinPosition(device.position, device.rotation, layout, pin)
}

/**
 * Devuelve los dispositivos en orden de evaluación: primero los que no dependen de nadie,
 * y cada uno después de todo lo que lo alimenta. Los que forman ciclos quedan al final, en
 * su orden original.
 */
export function levelize(elements: readonly Element[]): Device[] {
  const devices = elements.filter((element): element is Device => element.kind !== 'wire')
  const wires = elements.filter((element): element is Wire => element.kind === 'wire')
  const nets = new Nets(wires)

  // Quién empuja cada nodo: el id del dispositivo dueño del pin de salida. Es un mapa para
  // resolver las dependencias en O(n) en vez de comparar todos con todos.
  const driverOf = new Map<string, string>()
  for (const device of devices) {
    const point = outputPoint(device)
    if (point !== null) {
      driverOf.set(nets.netOf(point), device.id)
    }
  }

  const feeders = new Map<string, Set<string>>()
  const feedersOf = (id: string): Set<string> => {
    let set = feeders.get(id)
    if (set === undefined) {
      set = new Set()
      feeders.set(id, set)
    }
    return set
  }

  for (const device of devices) {
    feedersOf(device.id)
    const layout = deviceLayout(device)
    for (const pin of layout.pins) {
      if (pin.type !== 'input') {
        continue
      }
      const key = nets.netOf(pinPosition(device.position, device.rotation, layout, pin))
      const driver = driverOf.get(key)
      // Un dispositivo que se alimenta de sí mismo (un lazo) no se cuenta como dependencia.
      if (driver !== undefined && driver !== device.id) {
        feedersOf(device.id).add(driver)
      }
    }
  }

  // Kahn: los que no tienen alimentadores van primero.
  const queue: string[] = []
  for (const device of devices) {
    if (feedersOf(device.id).size === 0) {
      queue.push(device.id)
    }
  }

  const order: string[] = []
  const remaining = new Set(devices.map((device) => device.id))
  while (queue.length > 0) {
    const id = queue.shift() as string
    order.push(id)
    remaining.delete(id)
    for (const [deviceId, set] of feeders) {
      if (set.delete(id) && set.size === 0 && remaining.has(deviceId)) {
        queue.push(deviceId)
      }
    }
  }

  // Los que quedan están en un ciclo: al final, en su orden original.
  for (const device of devices) {
    if (remaining.has(device.id)) {
      order.push(device.id)
    }
  }

  const byId = new Map(devices.map((device) => [device.id, device]))
  const result: Device[] = []
  for (const id of order) {
    const device = byId.get(id)
    if (device !== undefined) {
      result.push(device)
    }
  }
  return result
}
