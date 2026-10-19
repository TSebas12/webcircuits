import { describe, expect, it } from 'vitest'
import { Diagram } from '../../../src/core/model/diagram'
import { circuitInstanceLayout, placedPins } from '../../../src/core/model/layout'
import type { Button, Circuit, Gate, GridPoint } from '../../../src/core/model/types'
import { distanceToSegment, hitTest, nearestPointOnSegment } from '../../../src/render/hit-test'

/** El circuito del corte vertical, que tiene de todo: pines, símbolos y cables. */
function slice(): Diagram {
  const diagram = new Diagram()

  const first = diagram.addButton({ x: 2, y: 2 })
  const second = diagram.addButton({ x: 2, y: 4 })
  const gate = diagram.addGate('and', { x: 8, y: 2 }, 2)
  const led = diagram.addGate('led', { x: 14, y: 3 }, 1)

  const pin = (device: Gate | Button, type: 'input' | 'output', index = 0): GridPoint => {
    const found = placedPins(device).filter((entry) => entry.pin.type === type)[index]
    if (found === undefined) {
      throw new Error('pin que no existe')
    }
    return found.point
  }

  diagram.addWire(pin(first, 'output'), pin(gate, 'input', 0))
  diagram.addWire(pin(second, 'output'), pin(gate, 'input', 1))
  diagram.addWire(pin(gate, 'output'), pin(led, 'input'))

  return diagram
}

describe('geometría de apoyo', () => {
  it('la distancia de un punto a un segmento tiene en cuenta los extremos', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 0 }

    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3)
    // Más allá del extremo no se mide contra la recta infinita, sino contra el extremo.
    expect(distanceToSegment({ x: 13, y: 0 }, a, b)).toBe(3)
  })

  it('un segmento de longitud cero se comporta como un punto', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5)
  })

  it('encuentra el punto del cable más cercano al cursor', () => {
    expect(nearestPointOnSegment({ x: 4.4, y: 2 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({
      x: 4,
      y: 0,
    })
  })
})

describe('qué hay bajo el cursor (M1-09)', () => {
  const elements = slice().elements

  it('acierta el pin de un símbolo', () => {
    // El pin de entrada del LED está en (14, 4).
    const hit = hitTest(elements, { x: 14, y: 4 })

    expect(hit?.kind).toBe('pin')
    expect(hit?.kind === 'pin' ? hit.point : null).toEqual({ x: 14, y: 4 })
  })

  it('el pin gana al símbolo que lo tiene al lado', () => {
    // (14,4) está justo en el borde del LED: si se mirara antes la caja del símbolo,
    // nunca se podría agarrar un pin para cablear.
    const hit = hitTest(elements, { x: 13.9, y: 4 })

    expect(hit?.kind).toBe('pin')
  })

  it('acierta el cuerpo de un símbolo', () => {
    const hit = hitTest(elements, { x: 9, y: 3 })

    expect(hit?.kind).toBe('device')
    expect(hit?.kind === 'device' ? hit.element.kind : null).toBe('gate')
  })

  it('acierta un cable por encima y por debajo, dentro de la tolerancia', () => {
    expect(hitTest(elements, { x: 6, y: 3 })?.kind).toBe('wire')
    expect(hitTest(elements, { x: 6, y: 3.2 })?.kind).toBe('wire')
  })

  it('fuera de la tolerancia el cable ya no se acierta', () => {
    expect(hitTest(elements, { x: 6, y: 3.5 })).toBeNull()
  })

  it('en el vacío no hay nada', () => {
    expect(hitTest(elements, { x: 40, y: 40 })).toBeNull()
  })

  it('un clic en el interruptor acierta su pin de salida', () => {
    const hit = hitTest(elements, { x: 4, y: 3 })

    expect(hit?.kind).toBe('pin')
    expect(hit?.kind === 'pin' ? hit.element.kind : null).toBe('button')
  })

  it('acierta el cuerpo y los pines de un subcircuito con su resolvedor', () => {
    const sheet = new Diagram()
    sheet.addPin({ x: 0, y: 0 }, { pinType: 'input', side: 'left' })
    sheet.addPin({ x: 6, y: 0 }, { pinType: 'output', side: 'right' })
    const target: Circuit = { id: 'sub', name: 'Sub', elements: sheet.storedElements }

    const main = new Diagram()
    const instance = main.addCircuitInstance({ x: 2, y: 3 }, target.id)
    const resolve = (id: string): Circuit | undefined => (id === target.id ? target : undefined)
    const size = circuitInstanceLayout(target)
    const center = {
      x: instance.position.x + size.width / 2,
      y: instance.position.y + size.height / 2,
    }

    const body = hitTest(main.elements, center, resolve)
    expect(body?.kind).toBe('device')
    expect(body?.kind === 'device' ? body.element.kind : null).toBe('circuit')

    const pin = placedPins(instance, resolve)[0]!
    const pinHit = hitTest(main.elements, pin.point, resolve)
    expect(pinHit?.kind).toBe('pin')
    expect(pinHit?.kind === 'pin' ? pinHit.point : null).toEqual(pin.point)
  })
})
