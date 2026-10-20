import { describe, it, expect } from 'vitest'
import { EventQueue } from '../../../../src/core/simulate/event-queue'
import { GlitchDetector } from '../../../../src/core/simulate/glitch-detector'

describe('M7B timing helpers', () => {
  it('EventQueue ordena por tiempo', () => {
    const q = new EventQueue()
    q.push({ time: 5, action: () => {} })
    q.push({ time: 1, action: () => {} })
    expect(q.pop()?.time).toBe(1)
    expect(q.pop()?.time).toBe(5)
  })
  it('GlitchDetector marca glitch', () => {
    const d = new GlitchDetector(10)
    expect(d.record(0)).toBeNull()
    expect(d.record(1)).toBeNull()
    const g = d.record(2)
    expect(g).not.toBeNull()
  })
})