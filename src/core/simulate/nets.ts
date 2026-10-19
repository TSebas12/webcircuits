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
 * Alcance: dos cables se unen solo si **comparten un extremo exacto**, y eso **no es una
 * simplificación de M1: es el modelo del original**. `ConductorMap.cs` solo mira los
 * `Point1` y `Point2` de cada cable, nunca su interior, así que dos cables **cruzados** no se
 * tocan y dos que se encuentran en un extremo sí. Las uniones en T no las hace el modelo:
 * las hace el editor, que **parte** el cable en dos por el punto de unión para que los
 * trozos pasen a compartir un extremo (`EditorDiagram.Split`, el Alt+clic del original).
 * Dibujar el cable no basta.
 *
 * Aquí viven además las dos consultas que necesita el dibujado: dónde hay que pintar el
 * punto de unión ([`junctionPoints`]) y qué pines están conectados ([`connectionCounts`]).
 */

import { placedPins, type CircuitResolver } from '../model/layout'
import type { Element, GridPoint, Wire } from '../model/types'

/** La clave de un punto de la rejilla. */
export function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`
}

/**
 * Cuántos extremos de cable hacen falta en un punto para dibujar ahí el punto de unión.
 *
 * Tres, y el número sale del original: `EditorDiagram.UpdateSolders` pide
 * `map.JunctionPoints(3)`. Con dos no se dibuja nada, porque dos cables que se encuentran
 * son un simple codo, no una unión que haya que anunciar.
 */
const JUNCTION_MIN_ENDPOINTS = 3

/**
 * Puntos donde se juntan tres o más cables: ahí va el punto de unión.
 *
 * En el original esto se llama *solder* y lo dibuja `EditorDiagram.UpdateSolders` a partir
 * de `Conductor.JunctionCount`, que cuenta **solo los extremos de los cables** —nunca los
 * pines, ni el interior de un cable—. Esa es la razón de que un cruce no se marque: dos
 * cables que se cruzan no comparten ningún extremo, así que no son el mismo nodo.
 */
export function junctionPoints(elements: readonly Element[]): GridPoint[] {
  const counts = new Map<string, { point: GridPoint; count: number }>()

  const add = (point: GridPoint): void => {
    const key = pointKey(point)
    const entry = counts.get(key)
    if (entry === undefined) {
      counts.set(key, { point, count: 1 })
    } else {
      entry.count += 1
    }
  }

  for (const element of elements) {
    if (element.kind !== 'wire') {
      continue
    }
    add(element.p1)
    add(element.p2)
  }

  const points: GridPoint[] = []
  for (const entry of counts.values()) {
    if (entry.count >= JUNCTION_MIN_ENDPOINTS) {
      points.push(entry.point)
    }
  }
  return points
}

/**
 * Cuántas cosas se apoyan en cada punto de la rejilla: cada extremo de cable cuenta uno y
 * cada pin cuenta otro. Un punto con **dos o más** miembros está conectado.
 *
 * Sirve para pintar los pines: el que ya tiene algo sale resaltado y el libre no. Y la
 * cuenta es fiel precisamente porque en este modelo solo se conecta por los extremos: un
 * cable que **pasa por encima** de un pin no suma, y el pin se queda pintado como libre,
 * que es lo que de verdad es.
 */
export function connectionCounts(
  elements: readonly Element[],
  resolveCircuit?: CircuitResolver,
): Map<string, number> {
  const counts = new Map<string, number>()

  const add = (point: GridPoint): void => {
    const key = pointKey(point)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  for (const element of elements) {
    if (element.kind === 'wire') {
      add(element.p1)
      add(element.p2)
      continue
    }
    for (const placed of placedPins(element, resolveCircuit)) {
      add(placed.point)
    }
  }

  return counts
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
