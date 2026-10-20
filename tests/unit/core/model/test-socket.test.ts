import { describe, expect, it } from 'vitest'
import { createTestSockets, isTestable } from '../../../../src/core/model/test-socket'
import type { Element, Pin } from '../../../../src/core/model/types'

function pin(id: string, pinType: 'input' | 'output', position: { x: number; y: number }): Pin {
  return {
    kind: 'pin',
    id,
    circuitId: 'main',
    layerId: 'principal',
    position,
    rotation: 'up',
    pinType,
    side: pinType === 'input' ? 'left' : 'right',
    bitWidth: 1,
    inverted: false,
    name: id,
  } as unknown as Pin
}

describe('sockets de test (M3-10)', () => {
  it('no es probabable sin entrada o sin salida', () => {
    const onlyInput = [pin('i', 'input', { x: 0, y: 0 })]
    const onlyOutput = [pin('o', 'output', { x: 0, y: 0 })]
    const none: Element[] = []

    expect(isTestable(onlyInput)).toBe(false)
    expect(isTestable(onlyOutput)).toBe(false)
    expect(isTestable(none)).toBe(false)
    expect(createTestSockets(onlyInput)).toBeNull()
  })

  it('es probabable con al menos una entrada y una salida', () => {
    const elements = [pin('i', 'input', { x: 0, y: 0 }), pin('o', 'output', { x: 4, y: 0 })]
    expect(isTestable(elements)).toBe(true)

    const sockets = createTestSockets(elements)
    expect(sockets).not.toBeNull()
    expect(sockets?.inputs).toHaveLength(1)
    expect(sockets?.outputs).toHaveLength(1)
    expect(sockets?.inputs[0]?.pinId).toBe('i')
    expect(sockets?.outputs[0]?.pinId).toBe('o')
  })

  it('ordena los sockets por posición', () => {
    const elements = [
      pin('i2', 'input', { x: 0, y: 4 }),
      pin('i1', 'input', { x: 0, y: 0 }),
      pin('o2', 'output', { x: 4, y: 4 }),
      pin('o1', 'output', { x: 4, y: 0 }),
    ]
    const sockets = createTestSockets(elements)
expect(sockets?.inputs.map((s: { pinId: string }) => s.pinId)).toEqual(['i1', 'i2'])
    expect(sockets?.outputs.map((s: { pinId: string }) => s.pinId)).toEqual(['o1', 'o2'])
  })
})