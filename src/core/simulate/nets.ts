/**
 * Conectividad: qué puntos de la rejilla forman un mismo nodo eléctrico.
 *
 * ⚠️ Aquí está una de las ideas más características del original: **un cable no sabe a qué
 * está conectado**. En `CircuitProject/Wire.cs` un cable son dos `GridPoint` y nada más; la
 * conexión se **deduce** de la geometría. Eso es lo que hace que dos cables se unan por
 * tocarse en una esquina sin que nadie se lo diga, y también lo que permite que el circuito
 * deje de ser un grafo dirigido y pase a ser «un montón de cables que se tocan».
 *
 * Se implementa con unión-búsqueda (union-find) sobre las claves de los puntos, con
 * compresión de camino para que las consultas salgan casi planas.
 *
 * ⚠️ Alcance de M1: dos cables se unen solo si **comparten un extremo exacto**. El original
 * además parte de los cruces y de las T, y tiene un `ConductorMap` de verdad; eso es M2.
 * Con lo de aquí ya se puede cablear un circuito normal, que es lo que pide el corte
 * vertical.
 */

import type { GridPoint, Wire } from '../model/types'

/** La clave de un punto de la rejilla. */
export function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`
}

export class Nets {
  private readonly parent = new Map<string, string>()

  constructor(wires: readonly Wire[]) {
    for (const wire of wires) {
      this.union(pointKey(wire.p1), pointKey(wire.p2))
    }
  }

  /** La raíz del nodo al que pertenece una clave. */
  private find(key: string): string {
    let root = key
    let next = this.parent.get(root)
    while (next !== undefined && next !== root) {
      root = next
      next = this.parent.get(root)
    }

    // Compresión de camino: los puntos por los que se ha pasado apuntan ya a la raíz,
    // así que las próximas consultas van directas.
    let walk = key
    while (walk !== root) {
      const step = this.parent.get(walk)
      this.parent.set(walk, root)
      if (step === undefined) {
        break
      }
      walk = step
    }

    return root
  }

  private union(a: string, b: string): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA !== rootB) {
      this.parent.set(rootB, rootA)
    }
  }

  /**
   * El nodo al que pertenece un punto.
   *
   * Un punto por el que no pasa ningún cable es un nodo de sí mismo: eso es exactamente
   * lo que queremos, porque entonces dos pines que caigan en el mismo punto sí se ven.
   */
  netOf(point: GridPoint): string {
    return this.find(pointKey(point))
  }

  /** ¿Estos dos puntos son el mismo nodo? */
  connected(a: GridPoint, b: GridPoint): boolean {
    return this.netOf(a) === this.netOf(b)
  }
}
