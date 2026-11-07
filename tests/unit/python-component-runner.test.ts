import { describe, expect, it, vi } from 'vitest'
import type { WorkerLike } from '../../src/app/scripting/runner'
import { ComponentRunner } from '../../src/app/scripting/component-runner'
import type { PythonComponentSpec } from '../../src/core/python/component-bridge'

describe('component runner', () => {
  it('rejects invalid spec', async () => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), listeners: [] as unknown[], addEventListener() {}, removeEventListener() {} }
    const runner = new ComponentRunner(() => worker as unknown as WorkerLike)
    const res = await runner.run('def compute(_): return [1]', {
      inputs: [],
      spec: { id: '', inputCount: 1, outputCount: 1 } as unknown as PythonComponentSpec,
    })
    expect(res.ok).toBe(false)
  })
})