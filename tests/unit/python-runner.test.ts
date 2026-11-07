import { describe, expect, it, vi } from 'vitest'
import { PythonRunner } from '../../src/app/scripting/runner'

describe('python runner', () => {
  it('resolves on worker message', async () => {
    const worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      listeners: [] as Array<(ev: { data: unknown }) => void>,
      addEventListener(type: string, cb: (ev: { data: unknown }) => void) {
        if (type === 'message') this.listeners.push(cb)
      },
      removeEventListener(type: string, cb: (ev: { data: unknown }) => void) {
        this.listeners = this.listeners.filter((l) => l !== cb)
      },
    }
    const runner = new PythonRunner(() => worker, 100)
    const promise = runner.run('print(1)')
    // Simulate worker response.
    const mockCalls = (worker.postMessage as unknown as { mock: { calls: Array<[unknown]> } }).mock.calls
    const id = (mockCalls[0]![0] as { id: string }).id
    worker.listeners.forEach((cb) => cb({ data: { id, ok: true, stdout: '1', returnValue: null } }))
    const res = await promise
    expect(res.ok).toBe(true)
    expect(res.stdout).toBe('1')
    expect(worker.terminate).toHaveBeenCalled()
  })

  it('times out', async () => {
    const worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      listeners: [] as Array<(ev: { data: unknown }) => void>,
      addEventListener(type: string, cb: (ev: { data: unknown }) => void) {
        if (type === 'message') this.listeners.push(cb)
      },
      removeEventListener(type: string, cb: (ev: { data: unknown }) => void) {
        this.listeners = this.listeners.filter((l) => l !== cb)
      },
    }
    const runner = new PythonRunner(() => worker, 10)
    const res = await runner.run('while True: pass')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('timeout')
    expect(worker.terminate).toHaveBeenCalled()
  })
})