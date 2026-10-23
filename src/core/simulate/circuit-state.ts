import { State } from '../function/state'
import type { CircuitFunction } from '../function/circuit-function'
import { FunctionTriStateGroup } from '../function/gates'

/**
 * Estado mutable de la simulación.
 *
 * Portado de `LogicCircuit/Function/CircuitState.cs`. Lleva el array de estados
 * (en `TypedArray`, que es lo que pedía M2-09), la lista de sucios para la
 * evaluación por eventos, y las listas de relojes/probetas/grupos tri-estado.
 *
 * M2-08 cierra aquí. El esqueleto que había (interfaz) se sustituye por la
 * clase real; `CircuitFunction` ya la usaba por su forma.
 */

export type FunctionUpdatedListener = () => void

export class CircuitState {
  private state: Uint8Array | null = null
  public count: number

  private dependent: CircuitFunction[][] | null = null
  private readonly _functions: CircuitFunction[] = []
  private readonly updated = new Set<CircuitFunction>()
  private readonly clockList: CircuitFunction[] = []
  private readonly triStateGroupList: FunctionTriStateGroup[] = []

  public random: number
  private readonly dirty: DirtyList

  /** Probetas registradas: reciben un tick por vuelta para llenar su historial. */
  private readonly probeList: { tick(): void }[] = []

  private readonly listeners: FunctionUpdatedListener[] = []

  constructor(reserveState: number, seed = (Date.now() & 0x7fffffff) | 0) {
    this.random = seed
    this.dirty = new DirtyList(seed)
    this.count = reserveState

    // Soporte de acceso por índice (`state[i]`), como en el original (`CircuitState.this[int]`).
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const target = this
    return new Proxy(target, {
      get(t, prop) {
        if (typeof prop === 'symbol') return (t as unknown as Record<symbol, unknown>)[prop]
        if (prop === 'then') return undefined
        const n = Number(prop)
        if (Number.isInteger(n) && n >= 0 && String(n) === prop) {
          return t.get(n)
        }
        return (t as unknown as Record<string, unknown>)[prop]
      },
      set(t, prop, value) {
        if (typeof prop === 'symbol') {
          (t as unknown as Record<symbol, unknown>)[prop] = value
          return true
        }
        const n = Number(prop)
        if (Number.isInteger(n) && n >= 0 && String(n) === prop) {
          t.set(n, value as State)
          return true
        }
        (t as unknown as Record<string, unknown>)[prop] = value
        return true
      },
    }) as unknown as CircuitState
  }

  /** Suscríbete a los avisos de "una función cambió su valor". */
  onFunctionUpdated(listener: FunctionUpdatedListener): () => void {
    this.listeners.push(listener)
    return () => {
      const i = this.listeners.indexOf(listener)
      if (i >= 0) this.listeners.splice(i, 1)
    }
  }

  private notifyFunctionUpdated(): void {
    for (const listener of this.listeners) listener()
  }

  get functions(): readonly CircuitFunction[] {
    return this._functions
  }

  get hasProbes(): boolean {
    return this.probeList.length > 0
  }

  get probes(): readonly { tick(): void }[] {
    // Tracer.Assert(this.HasProbes)
    return this.probeList
  }

  /** Registra una probeta para que reciba ticks del reloj. */
  registerProbe(probe: { tick(): void }): void {
    this.probeList.push(probe)
  }

  /** Avanza el historial de todas las probetas (original: `FunctionProbe.Tick`). */
  tickProbes(): void {
    for (const probe of this.probeList) {
      probe.tick()
    }
  }

  /**
   * Un entero pseudoaleatorio en `[0, max)`.
   *
   * Usa el mismo generador lineal que la lista de sucios del original. Está aquí para que
   * los sensores aleatorios no dependan de `Math.random` y una misma semilla dé la misma
   * secuencia en los tests.
   */
  nextRandom(max: number): number {
    this.random = (Math.imul(213_013, this.random) + 2_531_011) | 0
    return (this.random >>> 0) % Math.max(1, max)
  }

  /** Acceso por índice al estado de un pin. */
  get(index: number): State {
    return (this.state![index] as unknown as State)
  }

  set(index: number, value: State): void {
    this.state![index] = value
  }

  // Indexer-style access for `circuitState[i]` (read/write).
  // TS doesn't support real indexers on classes cleanly; expose via get/set above
  // and also allow bracket access through a Proxy? Keep get/set for clarity.

  reserveState(): number {
    return this.count++
  }

  defineFunction(function_: CircuitFunction): void {
    if (this.state === null) {
      this.state = new Uint8Array(this.count)
      this.dependent = new Array<CircuitFunction[]>(this.count)
      for (let i = 0; i < this.dependent.length; i++) {
        this.dependent[i] = []
      }
    }
    this._functions.push(function_)
    if (typeof (function_ as { flip?: () => boolean }).flip === 'function') {
      this.clockList.push(function_)
    }
    let count = 0
    for (const parameter of function_.parameters) {
      this.dependent![parameter]!.push(function_)
      count++
    }
    if (count <= 0) {
      this.dirty.add(function_)
    }
    if (function_ instanceof FunctionTriStateGroup) {
      this.triStateGroupList.push(function_)
    }
  }

  endDefinition(): void {
    if (this.state === null) {
      this.state = new Uint8Array(this.count)
      // Tracer.Assert(this.functions.length === 0)
    }
    for (const fn of this._functions) {
      const result = fn.results
      if (result.length > 0) {
        // Dependent = union of dependents of each result pin
        const depSet = new Set<CircuitFunction>()
        for (const r of result) {
          for (const d of this.dependent![r]!) {
            depSet.add(d)
          }
        }
        fn.dependent = [...depSet]
      }
    }
    for (const group of this.triStateGroupList) {
      this.dirty.addMany(group.dependent ?? [])
    }
  }

  markUpdated(function_: CircuitFunction): void {
    const wasAdded = this.updated.add(function_)
    if (wasAdded) {
      this.notifyFunctionUpdated()
    }
  }

  evaluate(flipClock: boolean): boolean {
    if (this.state === null) {
      this.state = new Uint8Array(this.count)
    }
    const state = this.state
    if (this.updated.size > 0) {
      const toAdd = [...this.updated]
      this.updated.clear()
      this.dirty.addMany(toAdd)
    }
    if (flipClock) {
      for (const c of this.clockList) {
        const clock = c as unknown as { flip(): boolean }
        if (typeof clock.flip === 'function' && clock.flip()) {
          this.dirty.add(c)
        }
      }
    }
    const maxRetry = 3
    let attempt = 0
    this.dirty.delay = attempt
    let oscillation = state.length * state.length
    let function_: CircuitFunction | null
    while ((function_ = this.dirty.get()) !== null) {
      if (function_.evaluate()) {
        if (function_.dependent !== null) {
          this.dirty.addMany(function_.dependent)
        }
        if (oscillation-- < 0) {
          if (maxRetry <= attempt) {
            return false
          }
          oscillation = state.length * state.length
          this.dirty.delay = ++attempt
        }
      }
    }
    return true
  }

  toString(): string {
    if (this.state === null) return ''
    let text = ''
    for (let i = 0; i < this.state.length; i++) {
      text += CircuitFunction_toChar(this.state[i] as unknown as State)
    }
    return text
  }
}

function CircuitFunction_toChar(s: State): string {
  switch (s) {
    case State.Off:
      return '-'
    case State.On0:
      return '0'
    case State.On1:
      return '1'
    default:
      return '?'
  }
}

// ---------------------------------------------------------------------------
// DirtyList (inner class of the original, ported as a standalone class here)
// ---------------------------------------------------------------------------

/**
 * La lista de sucios del original (`CircuitState.DirtyList`, una clase anidada privada).
 *
 * Se exporta solo para que los tests de paridad puedan reproducir
 * `CircuitStateDirtyListTest.cs`, que en C# llegaba a ella por reflexión. El resto del motor
 * la usa a través de `CircuitState`.
 */
export class DirtyList {
  private current: FunctionList
  private next: FunctionList
  private seed: number
  private iteration = 1

  private index = 1
  private offset = 0
  private step = 0

  constructor(seed: number) {
    this.seed = seed
    this.delay = 0
    this.current = new FunctionList(1024)
    this.next = new FunctionList(1024)
  }

  add(function_: CircuitFunction): void {
    if (function_.iteration < this.iteration) {
      function_.iteration = this.iteration
      this.next.add(function_)
    }
  }

  addMany(functions: Iterable<CircuitFunction>): void {
    for (const f of functions) this.add(f)
  }

  get(): CircuitFunction | null {
    let count = this.current.count
    if (count <= this.index) {
      count = this.next.count
      if (count <= 0) {
        return null
      }
      this.iteration++
      // Clear the (consumed) current so it can be reused as `next`.
      this.current.clear()
      const temp = this.next
      this.next = this.current
      this.current = temp

      this.index = 1

      // step = int.MaxValue % count
      this.step = 2147483647 % count

      // simple but fast random number generator
      this.seed = 214013 * this.seed + 2531011

      // this will just make sure: 0 <= random < count
      const random = (2147483647 & this.seed) % count
      this.offset = random

      if (this.delay > 0 && count > 1) {
        const max = Math.min(this.delay, count - 1)
        for (let i = 0; i < max; i++) {
          const got = this.get()
          if (got !== null) this.add(got)
        }
      }
    } else {
      this.index++
      let random = this.offset - this.step
      if (random < 0) random += count
      this.offset = random
    }

    if (this.offset < 0 || this.offset >= this.current.count) {
      return null
    }
    return this.current.get(this.offset)
  }

  get delay(): number {
    return this._delay
  }
  set delay(v: number) {
    this._delay = v
  }
  private _delay = 0
}

class FunctionList {
  private list: { cf: CircuitFunction | null }[]
  public count = 0

  constructor(size: number) {
    this.list = new Array(size).fill(null).map(() => ({ cf: null }))
  }

  get(index: number): CircuitFunction {
    return this.list[index]!.cf as CircuitFunction
  }

  set(index: number, value: CircuitFunction): void {
    this.list[index]!.cf = value
  }

  add(f: CircuitFunction): void {
    if (this.list.length <= this.count) {
      const bigger = new Array(this.list.length * 2).fill(null).map(() => ({ cf: null as CircuitFunction | null }))
      for (let i = 0; i < this.count; i++) bigger[i]! = this.list[i]!
      this.list = bigger
    }
    this.list[this.count]!.cf = f
    this.count++
  }

  clear(): void {
    this.count = 0
  }
}
