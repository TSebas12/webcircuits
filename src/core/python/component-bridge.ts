export interface PythonComponentSpec {
  readonly id: string
  readonly inputCount: number
  readonly outputCount: number
  /** Optional human title. */
  readonly title?: string
}

export interface PythonBridge {
  /** Evaluate a pure function given inputs; must be deterministic. */
  evaluate(inputs: readonly number[]): number[] | Promise<number[]>
}

/**
 * Minimal validator for a component spec coming from user scripts.
 */
export function validateComponentSpec(raw: unknown): PythonComponentSpec | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id.length === 0) return null
  if (typeof r.inputCount !== 'number' || !Number.isInteger(r.inputCount) || r.inputCount < 0 || r.inputCount > 64) return null
  if (typeof r.outputCount !== 'number' || !Number.isInteger(r.outputCount) || r.outputCount < 1 || r.outputCount > 64) return null
  return {
    id: r.id,
    inputCount: r.inputCount,
    outputCount: r.outputCount,
    title: typeof r.title === 'string' ? r.title : undefined,
  }
}