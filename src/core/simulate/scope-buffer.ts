/**
 * Buffer circular de muestras para el osciloscopio (M7-01).
 *
 * El original guarda las muestras de cada probeta en un `History<T>` de capacidad fija:
 * al llenarse, la muestra más antigua se pisa. Así el osciloscopio puede enseñar un
 * intervalo acotado sin crecer sin límite, y la memoria no depende de cuánto tiempo lleve
 * encendido el circuito.
 *
 * Esta clase es la portación directa de ese `History<T>`, quitando el enganche de
 * concurrencia (`adding`), que no tiene sentido en un motor de un solo hilo. Lo que queda
 * es la semántica: capacidad fija, escritura que pisa lo viejo y lectura en orden cronológico.
 */
export class ScopeBuffer<T> {
  private readonly list: T[]
  private head = 0
  private count = 0

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('la capacidad del buffer debe ser un entero positivo')
    }
    this.list = new Array<T>(capacity)
  }

  /** Cuántas muestras caben. */
  get capacity(): number {
    return this.list.length
  }

  /** Cuántas muestras hay guardadas ahora mismo. */
  get size(): number {
    return this.count
  }

  /** Si el buffer ya dio la vuelta al menos una vez. */
  get isFull(): boolean {
    return this.count === this.list.length
  }

  /** Añade una muestra, pisando la más antigua si el buffer está lleno. */
  add(value: T): void {
    this.list[this.head] = value
    this.head = (this.head + 1) % this.list.length
    if (this.count < this.list.length) {
      this.count += 1
    }
  }

  /** Devuelve las muestras en orden cronológico (de la más antigua a la más reciente). */
  toArray(): T[] {
    if (this.count < this.list.length) {
      return this.list.slice(0, this.count)
    }
    return [...this.list.slice(this.head), ...this.list.slice(0, this.head)]
  }

  /** Vacía el buffer sin cambiar su capacidad. */
  clear(): void {
    this.head = 0
    this.count = 0
  }
}
