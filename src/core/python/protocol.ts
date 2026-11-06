export interface PythonRunRequest {
  readonly id: string
  readonly code: string
  /** Max execution time in ms. */
  readonly timeoutMs: number
}

export interface PythonRunResult {
  readonly id: string
  readonly ok: boolean
  readonly stdout: string
  readonly returnValue?: unknown
  readonly error?: string
}

/** Pure validation of an incoming runner request. */
export function validateRequest(raw: unknown): PythonRunRequest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id.length === 0 || r.id.length > 64) return null
  if (typeof r.code !== 'string' || r.code.length === 0 || r.code.length > 200_000) return null
  const timeout =
    typeof r.timeoutMs === 'number' && Number.isFinite(r.timeoutMs) && r.timeoutMs > 0
      ? Math.min(r.timeoutMs, 60_000)
      : 5_000
  return { id: r.id, code: r.code, timeoutMs: timeout }
}

/** Decide if code looks dangerous at the metadata level (best-effort, NOT a sandbox). */
export function isSuspiciousCode(code: string): boolean {
  // Note: this is advisory only. Real isolation must be provided by the Pyodide worker.
  const lowered = code.toLowerCase()
  const patterns = ['__import__', 'open(', 'os.', 'sys.', 'subprocess', 'eval(']
  return patterns.some((p) => lowered.includes(p))
}