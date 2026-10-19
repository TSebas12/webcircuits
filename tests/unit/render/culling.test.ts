import { describe, expect, it } from 'vitest'
import { cullItems, itemBox } from '../../../src/render/culling'
import type { CameraState } from '../../../src/render/camera'
import type { DrawDevice, DrawItem } from '../../../src/render/ir-renderer'

function camera(zoom = 1, offsetX = 0, offsetY = 0): CameraState {
  return { zoom, offsetX, offsetY }
}

function device(x: number, y: number, rotation: DrawDevice['rotation'] = 'up'): DrawDevice {
  return {
    kind: 'device',
    shape: 'and',
    position: { x, y },
    rotation,
    width: 3,
    height: 4,
    selected: false,
    state: 'off',
  }
}

describe('la caja de una pieza (M2-16)', () => {
  it('sin girar, es la esquina más el tamaño', () => {
    expect(itemBox(device(10, 10))).toEqual({ x0: 10, y0: 10, x1: 13, y1: 14 })
  })

  it('un giro de 180° se sale a la izquierda, y la caja lo tiene en cuenta', () => {
    // El centro de rotación es (1, 2) con división entera, así que el símbolo girado queda
    // de x = 9 a 12, no de 10 a 13.
    expect(itemBox(device(10, 10, 'down'))).toEqual({ x0: 9, y0: 10, x1: 12, y1: 14 })
  })

  it('un giro de 90° cambia el alto y el ancho efectivos', () => {
    expect(itemBox(device(10, 10, 'right'))).toEqual({ x0: 9, y0: 11, x1: 13, y1: 14 })
  })

  it('un cable es el rectángulo de sus dos extremos', () => {
    const wire: DrawItem = {
      kind: 'wire',
      p1: { x: 5, y: 9 },
      p2: { x: 2, y: 4 },
      selected: false,
      signal: 'idle',
      bus: false,
    }
    expect(itemBox(wire)).toEqual({ x0: 2, y0: 4, x1: 5, y1: 9 })
  })
})

describe('culling de viewport (M2-16)', () => {
  it('deja fuera lo que no entra en pantalla', () => {
    const visible = device(2, 2) // en pantalla
    const far = device(500, 500) // muy lejos
    const kept = cullItems([visible, far], camera(), 1000, 600)

    expect(kept).toEqual([visible])
  })

  it('lo que cruza el borde se queda', () => {
    // A zoom 1 con 1000×600 salen ~55×33 celdas a la vista; una pieza en (50, 0) entra.
    const kept = cullItems([device(50, 0)], camera(), 1000, 600)
    expect(kept).toHaveLength(1)
  })

  it('con el lienzo sin tamaño todavía, no se descarta nada', () => {
    // En los tests y en el primer fotograma el lienzo puede medir 1×1: ahí no se recorta.
    const items = [device(2, 2), device(500, 500)]
    expect(cullItems(items, camera(), 1, 1)).toEqual(items)
  })
})
