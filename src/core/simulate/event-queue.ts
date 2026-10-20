/**
 * Cola de eventos ordenada por tiempo (M7B-02).
 *
 * Base del modelo con retardos: cada evento lleva un instante (en unidades de tiempo)
 * y se despacha en orden creciente. Implementación con heap binario mínimo.
 */

export interface TimedEvent {
  /** Instante en el que se dispara, en unidades de tiempo. */
  readonly time: number
  /** Callback a ejecutar. */
  readonly action: () => void
}

export class EventQueue {
  private heap: TimedEvent[] = []

  get size(): number {
    return this.heap.length
  }

  push(event: TimedEvent): void {
    this.heap.push(event)
    this.siftUp(this.heap.length - 1)
  }

  /** Saca y devuelve el evento de menor tiempo, o null si está vacía. */
  pop(): TimedEvent | null {
    if (this.heap.length === 0) return null
    const top = this.heap[0]!
    const last = this.heap.pop()!
    if (this.heap.length > 0) {
      this.heap[0] = last
      this.siftDown(0)
    }
    return top
  }

  /** Mira el próximo evento sin sacarlo. */
  peek(): TimedEvent | null {
    return this.heap.length > 0 ? this.heap[0]! : null
  }

  clear(): void {
    this.heap = []
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2)
      if (this.heap[parent]!.time <= this.heap[i]!.time) break
      ;[this.heap[parent], this.heap[i]] = [this.heap[i]!, this.heap[parent]!]
      i = parent
    }
  }

  private siftDown(i: number): void {
    const n = this.heap.length
    while (true) {
      let smallest = i
      const left = 2 * i + 1
      const right = 2 * i + 2
      if (left < n && this.heap[left]!.time < this.heap[smallest]!.time) smallest = left
      if (right < n && this.heap[right]!.time < this.heap[smallest]!.time) smallest = right
      if (smallest === i) break
      ;[this.heap[smallest], this.heap[i]] = [this.heap[i]!, this.heap[smallest]!]
      i = smallest
    }
  }
}