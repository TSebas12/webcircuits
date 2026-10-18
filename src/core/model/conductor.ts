import type { GridPoint } from './types'

/**
 * Un cable visto por el mapa de conductores: lo único que importa es por dónde
 * pasa, es decir, sus dos puntas. Es la misma noción que `Wire` en el modelo, pero
 * reducida para que este módulo no dependa de él.
 */
export interface ConductorWire {
  readonly p1: GridPoint
  readonly p2: GridPoint
}

function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`
}

/**
 * Un conductor es el conjunto de cables que están conectados (directa o
 * indirectamente) entre sí. Lleva la cuenta de cuántos extremos de cable
 * llegan a cada punto, que es lo que hace falta para saber si un punto es una
 * **unión** (3 o más) y no un simple codo (2).
 *
 * Portado de `LogicCircuit/Conductor.cs`.
 */
export class Conductor {
  private readonly _wires = new Set<ConductorWire>()
  private readonly _pointCount = new Map<string, number>()

  add(wire: ConductorWire): boolean {
    if (this._wires.has(wire)) {
      return false
    }
    this._wires.add(wire)
    const bump = (point: GridPoint): void => {
      const key = pointKey(point)
      this._pointCount.set(key, (this._pointCount.get(key) ?? 0) + 1)
    }
    bump(wire.p1)
    bump(wire.p2)
    return true
  }

  get wires(): readonly ConductorWire[] {
    return [...this._wires]
  }

  get points(): GridPoint[] {
    const result: GridPoint[] = []
    for (const key of this._pointCount.keys()) {
      const parts = key.split(',')
      const x = Number(parts[0])
      const y = Number(parts[1])
      result.push({ x, y })
    }
    return result
  }

  contains(point: GridPoint): boolean
  contains(wire: ConductorWire): boolean
  contains(arg: GridPoint | ConductorWire): boolean {
    if (typeof arg === 'object' && 'p1' in arg && 'p2' in arg) {
      return this._wires.has(arg as ConductorWire)
    }
    return this._pointCount.has(pointKey(arg as GridPoint))
  }

  junctionCount(point: GridPoint): number {
    return this._pointCount.get(pointKey(point)) ?? 0
  }

  *junctionPoints(minCount: number): Iterable<GridPoint> {
    for (const [key, count] of this._pointCount) {
      if (minCount <= count) {
        const parts = key.split(',')
        yield { x: Number(parts[0]), y: Number(parts[1]) }
      }
    }
  }
}

/**
 * Agrupa los cables de un circuito en conductores: dos cables están en el mismo
 * conductor si comparten un punto. Es lo que usa el editor para saber si un
 * punto es una unión (3 o más extremos) y el motor para recorrer una red.
 *
 * Portado de `LogicCircuit/ConductorMap.cs`. El constructor original recibía un
 * `LogicalCircuit` y leía sus cables; aquí se le pasa directamente la lista de
 * cables, para no depender del modelo completo (que llega en M2-05).
 */
export class ConductorMap {
  private readonly map = new Map<string, Conductor>()
  private readonly list = new Set<Conductor>()

  constructor(wires: Iterable<ConductorWire>) {
    for (const wire of wires) {
      const p1 = wire.p1
      const p2 = wire.p2
      // En el original esto es un `Tracer.Assert(p1 != p2)`: un cable de longitud
      // cero no tiene sentido y no se crea nunca.
      if (pointKey(p1) === pointKey(p2)) {
        continue
      }

      let conductor: Conductor | undefined
      const c1 = this.map.get(pointKey(p1))
      const c2 = this.map.get(pointKey(p2))

      if (c1 !== undefined) {
        conductor = c1
        if (c2 === undefined) {
          this.map.set(pointKey(p2), conductor)
        } else if (c1 !== c2) {
          conductor = this.join(conductor, c2)
        }
      } else if (c2 !== undefined) {
        conductor = c2
        this.map.set(pointKey(p1), conductor)
      } else {
        conductor = new Conductor()
        this.map.set(pointKey(p1), conductor)
        this.map.set(pointKey(p2), conductor)
        this.list.add(conductor)
      }
      conductor.add(wire)
    }
  }

  private join(conductor: Conductor, other: Conductor): Conductor {
    for (const wire of other.wires) {
      conductor.add(wire)
      this.map.set(pointKey(wire.p1), conductor)
      this.map.set(pointKey(wire.p2), conductor)
    }
    this.list.delete(other)
    return conductor
  }

  tryGetValue(point: GridPoint): Conductor | undefined {
    return this.map.get(pointKey(point))
  }

  get conductors(): Conductor[] {
    return [...this.list]
  }

  junctionCount(point: GridPoint): number {
    const conductor = this.map.get(pointKey(point))
    if (conductor === undefined) {
      return 0
    }
    return conductor.junctionCount(point)
  }

  *junctionPoints(minCount: number): Iterable<GridPoint> {
    for (const conductor of this.list) {
      yield* conductor.junctionPoints(minCount)
    }
  }
}