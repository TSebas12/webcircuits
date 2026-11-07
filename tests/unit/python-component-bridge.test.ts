import { describe, expect, it } from 'vitest'
import { validateComponentSpec } from '../../src/core/python/component-bridge'

describe('python component bridge', () => {
  it('validates good spec', () => {
    const spec = validateComponentSpec({ id: 'and2', inputCount: 2, outputCount: 1 })
    expect(spec?.id).toBe('and2')
  })
  it('rejects bad spec', () => {
    expect(validateComponentSpec(null)).toBeNull()
    expect(validateComponentSpec({ id: '', inputCount: 1, outputCount: 1 })).toBeNull()
    expect(validateComponentSpec({ id: 'x', inputCount: 1.5, outputCount: 1 })).toBeNull()
  })
})