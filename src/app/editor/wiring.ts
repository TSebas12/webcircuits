/**
 * Cableado interactivo avanzado (M2-22): máquina de estados para colocar cables
 * con puntos de quiebre.
 */

export type WiringState = 'idle' | 'wiring' | 'cancelled'

export class WiringSession {
  private points: { x: number; y: number }[] = []
  state: WiringState = 'idle'

  start(x: number, y: number): void {
    this.points = [{ x, y }]
    this.state = 'wiring'
  }

  addBreakpoint(x: number, y: number): void {
    if (this.state !== 'wiring') return
    this.points.push({ x, y })
  }

  cancel(): void {
    this.points = []
    this.state = 'cancelled'
  }

  finish(x: number, y: number): { x: number; y: number }[] | null {
    if (this.state !== 'wiring') return null
    this.points.push({ x, y })
    const result = [...this.points]
    this.points = []
    this.state = 'idle'
    return result
  }

  get currentPoints(): readonly { x: number; y: number }[] {
    return this.points
  }
}