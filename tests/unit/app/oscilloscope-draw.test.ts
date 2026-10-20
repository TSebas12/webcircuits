import { describe, expect, it } from 'vitest'
import { makeFakeContext } from '../support/canvas'
import { drawOscilloscope } from '../../../src/app/components/oscilloscope/oscilloscope-draw'

describe('drawOscilloscope (M7-02)', () => {
  it('no revienta sin señales', () => {
    const { ctx } = makeFakeContext()
    expect(() =>
      drawOscilloscope(ctx, 200, 120, [], {
        background: '#000',
        grid: '#222',
        text: '#fff',
        channels: ['#f00'],
      }),
    ).not.toThrow()
  })

  it('dibuja varias señales', () => {
    const { ctx, named } = makeFakeContext()
    drawOscilloscope(
      ctx,
      200,
      120,
      [
        { label: 'A', samples: [0, 1, 1, 0] },
        { label: 'B', samples: [1, 0, 1, 0] },
      ],
      { background: '#000', grid: '#222', text: '#fff', channels: ['#f00', '#0f0'] },
    )

    expect(named('fillRect').length).toBeGreaterThan(0)
    expect(named('stroke').length).toBeGreaterThan(0)
    expect(named('fillText').length).toBeGreaterThan(0)
  })
})