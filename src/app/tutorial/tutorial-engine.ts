export interface TutorialStep {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly check?: () => boolean
}

export class TutorialEngine {
  private index = 0
  constructor(private readonly steps: readonly TutorialStep[]) {}

  current(): TutorialStep | null {
    return this.steps[this.index] ?? null
  }

  next(): boolean {
    if (this.index < this.steps.length - 1) {
      this.index += 1
      return true
    }
    return false
  }

  prev(): boolean {
    if (this.index > 0) {
      this.index -= 1
      return true
    }
    return false
  }

  completed(): boolean {
    const step = this.current()
    return (step?.check?.() ?? true) && this.index === this.steps.length - 1
  }

  reset(): void {
    this.index = 0
  }
}
