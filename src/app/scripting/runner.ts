import type { PythonRunRequest, PythonRunResult } from '../../core/python/protocol'
import { validateRequest } from '../../core/python/protocol'

export interface RunnerOptions {
  readonly timeoutMs?: number
  readonly warnOnSuspicious?: boolean
}

/** Minimal shape of a Web Worker used by the runner; allows injection in tests. */
export interface WorkerLike {
  postMessage(message: unknown): void
  terminate(): void
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void
  removeEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void
}

export type WorkerFactory = () => WorkerLike

export class PythonRunner {
  private readonly factory: WorkerFactory
  private readonly defaultTimeout: number

  constructor(factory: WorkerFactory, defaultTimeout = 5_000) {
    this.factory = factory
    this.defaultTimeout = defaultTimeout
  }

  run(code: string, options: RunnerOptions = {}): Promise<PythonRunResult> {
    return new Promise((resolve) => {
      const validated = validateRequest({
        id: cryptoRandomId(),
        code,
        timeoutMs: options.timeoutMs ?? this.defaultTimeout,
      })
      if (!validated) {
        resolve({ id: '', ok: false, stdout: '', error: 'invalid request' })
        return
      }

      const worker = this.factory()
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined // eslint-disable-line prefer-const
      const cleanup = () => {
        worker.removeEventListener('message', handler)
        worker.terminate()
      }
      const finish = (result: PythonRunResult) => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        cleanup()
        resolve(result)
      }

      const handler = (ev: { data: unknown }) => {
        const data = ev.data as PythonRunResult
        if (data && data.id === validated.id) {
          finish(data)
        }
      }
      worker.addEventListener('message', handler)
      worker.postMessage(validated as PythonRunRequest)

      timer = setTimeout(() => {
        finish({ id: validated.id, ok: false, stdout: '', error: 'timeout' })
      }, validated.timeoutMs + 250)
    })
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
}