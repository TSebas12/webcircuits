import { describe, expect, it } from 'vitest'
import { buildComponentCode } from '../../src/app/scripting/component-runner'

describe('buildComponentCode', () => {
  it('incluye inputs y validacion de salida', () => {
    const code = buildComponentCode('def compute(inputs):\n    return [inputs[0] and inputs[1]]', {
      id: 'c',
      inputCount: 2,
      outputCount: 1,
    })
    expect(code).toContain('_inputs = [0, 0]')
    expect(code).toContain('isinstance(_result, (list, tuple))')
    expect(code).toContain('len(_result) == 1')
  })
})
