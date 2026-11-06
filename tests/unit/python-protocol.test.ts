import { describe, expect, it } from 'vitest'
import { isSuspiciousCode, validateRequest } from '../../src/core/python/protocol'

describe('python protocol', () => {
  it('validates a good request', () => {
    const r = validateRequest({ id: 'a', code: 'x = 1', timeoutMs: 1000 })
    expect(r?.id).toBe('a')
    expect(r?.timeoutMs).toBe(1000)
  })

  it('rejects bad input', () => {
    expect(validateRequest(null)).toBeNull()
    expect(validateRequest({ id: '', code: 'x' })).toBeNull()
    expect(validateRequest({ id: 'a', code: '' })).toBeNull()
  })

  it('clamps timeout', () => {
    const r = validateRequest({ id: 'a', code: 'x', timeoutMs: 999_999 })
    expect(r?.timeoutMs).toBe(60_000)
  })

  it('defaults timeout', () => {
    const r = validateRequest({ id: 'a', code: 'x' })
    expect(r?.timeoutMs).toBe(5_000)
  })

  it('detects suspicious', () => {
    expect(isSuspiciousCode('import os; os.system("rm -rf /")')).toBe(true)
    expect(isSuspiciousCode('print(2+2)')).toBe(false)
  })
})