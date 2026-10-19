/**
 * Las conexiones ya resueltas de un circuito: quién alimenta a quién.
 *
 * Portado de `LogicCircuit/Runner/CircuitMap.Connection.cs`.
 *
 * Es la memoria del recorrido. Cuando `CircuitMap.Connect` decide que un pin de salida
 * alimenta a un pin de entrada, no basta con evaluarlo una vez: hay que **recordarlo**,
 * porque el mismo par se va a volver a encontrar al recorrer el circuito por otro camino
 * (un abanico, un lazo de realimentación). Sin esta memoria, un lazo con dos compuertas se
 * recorrería para siempre.
 *
 * Se recuerda en un solo sentido —**salida → entradas**—, que es como se propaga la
 * corriente: de una salida salen muchos cables, pero a una entrada solo le llega uno.
 *
 * ⚠️ Las puntas se usan como **clave por identidad** (`Map`), no por valor. Es lo que
 * permite que `Jam` se identifique consigo misma aunque esté lejos de donde se creó; ver
 * `model/symbol.ts`.
 */

import type { Id } from '../model/types'
import type { Jam } from '../model/symbol'

/** Un cable resuelto: de esta punta de salida a esta punta de entrada. */
export class Connection {
  constructor(
    /** La punta que recibe (nunca una salida). */
    readonly inJam: Jam,
    /** La punta que alimenta (nunca una entrada). */
    readonly outJam: Jam,
  ) {
    // Tracer.Assert(inJam.EffectivePinType != PinType.Output)
    // Tracer.Assert(outJam.EffectivePinType != PinType.Input)
  }

  toString(): string {
    return `Connect ${describe(this.outJam)} -> ${describe(this.inJam)}`
  }
}

function describe(jam: Jam): string {
  const point = jam.point
  return `${jam.effectivePinType}:${jam.bitWidth}@${point.x},${point.y}`
}

/**
 * El conjunto de conexiones ya resueltas de un circuito.
 *
 * Además de los cables, lleva la cuenta de **qué circuitos se han resuelto ya**. Esa
 * cuenta es la clave de una optimización del original que conviene entender antes de
 * tocar nada: las puntas de un símbolo **pertenecen al símbolo**, y un símbolo está
 * colocado dentro de *su* circuito, así que sus coordenadas son **locales a ese circuito**.
 * Por eso dos colocaciones del mismo subcircuito comparten las mismas puntas, y resolver
 * los cables de ese subcircuito una vez vale para las dos. Y por eso la cuenta va por
 * circuito y no por colocación.
 */
export class ConnectionSet {
  private readonly visited = new Set<Id>()
  private readonly outputs = new Map<Jam, Map<Jam, Connection>>()

  /** ¿Se han resuelto ya los cables de este circuito? */
  isConnected(circuitId: Id): boolean {
    return this.visited.has(circuitId)
  }

  /** Anota que sí. No se deshace: los cables de un circuito no cambian durante el recorrido. */
  markConnected(circuitId: Id): void {
    // Tracer.Assert(!this.isConnected(circuitId))
    this.visited.add(circuitId)
  }

  /**
   * Anota una conexión, si no lo estaba.
   *
   * Devolver la misma `Connection` cuando el par se repite es lo que hace que el recorrido
   * termine: la segunda vez que se llega por otro camino, `Connect` ya sabe que ese tramo
   * está hecho y no lo vuelve a bajar.
   */
  connect(inJam: Jam, outJam: Jam): Connection {
    let inputs = this.outputs.get(outJam)
    if (inputs !== undefined) {
      const existing = inputs.get(inJam)
      if (existing !== undefined) {
        return existing
      }
    } else {
      inputs = new Map()
      this.outputs.set(outJam, inputs)
    }

    const connection = new Connection(inJam, outJam)
    inputs.set(inJam, connection)
    return connection
  }

  /** Todo lo que cuelga de esta salida. */
  selectByOutput(outJam: Jam): Connection[] {
    return [...(this.outputs.get(outJam)?.values() ?? [])]
  }

  /** Todas las conexiones, en el orden en que se resolvieron. */
  all(): Connection[] {
    const list: Connection[] = []
    for (const inputs of this.outputs.values()) {
      list.push(...inputs.values())
    }
    return list
  }
}
