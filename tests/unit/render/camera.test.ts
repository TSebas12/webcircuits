import { describe, expect, it } from 'vitest'
import { Camera, MAX_ZOOM, MIN_ZOOM, clampZoom, visibleWorldRect } from '../../../src/render/camera'
import { GRID_SIZE } from '../../../src/render/geometry'

describe('clampZoom', () => {
  it('recorta a los límites del original (0,1 – 3)', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(clampZoom(99)).toBe(MAX_ZOOM)
    expect(clampZoom(1.5)).toBe(1.5)
  })

  it('no se atraganta con valores raros', () => {
    expect(clampZoom(Number.NaN)).toBe(1)
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MAX_ZOOM)
  })
})

describe('Camera', () => {
  it('arranca en zoom 1, sin desplazamiento', () => {
    const camera = new Camera()
    expect(camera.state).toEqual({ offsetX: 0, offsetY: 0, zoom: 1 })
  })

  it('una celda de rejilla son 18 px a zoom 1', () => {
    const camera = new Camera()
    expect(camera.toScreenX(1)).toBe(GRID_SIZE)
    expect(camera.toScreenY(3)).toBe(3 * GRID_SIZE)
  })

  it('el desplazamiento mueve la vista en píxeles', () => {
    const camera = new Camera()
    camera.panBy(40, -25)
    expect(camera.state.offsetX).toBe(40)
    expect(camera.state.offsetY).toBe(-25)
    expect(camera.toScreenX(0)).toBe(40)
  })

  it('va y vuelve entre mundo y pantalla', () => {
    const camera = new Camera()
    camera.zoom = 2
    camera.panBy(17, 33)
    const world = camera.toWorld(120, 240)
    expect(camera.toScreenX(world.x)).toBeCloseTo(120, 10)
    expect(camera.toScreenY(world.y)).toBeCloseTo(240, 10)
  })

  it('al hacer zoom se queda quieto el punto que hay bajo el cursor', () => {
    const camera = new Camera()
    camera.panBy(50, 20)
    const before = camera.toWorld(300, 200)

    camera.zoomAt(300, 200, 2)

    const after = camera.toWorld(300, 200)
    expect(camera.zoom).toBe(2)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)
  })

  it('el zoom no se pasa de los límites del original', () => {
    const camera = new Camera()
    camera.zoomAt(0, 0, 1000)
    expect(camera.zoom).toBe(MAX_ZOOM)
    camera.zoomAt(0, 0, 0.000001)
    expect(camera.zoom).toBe(MIN_ZOOM)
  })

  it('redondea a la celda más cercana', () => {
    const camera = new Camera()
    const scale = GRID_SIZE
    expect(camera.toGrid(scale * 2.4, scale * 7.6)).toEqual({ x: 2, y: 8 })
  })

  it('centra el punto indicado en la ventana', () => {
    const camera = new Camera()
    camera.centerOn(10, 20, 800, 600)
    expect(camera.toScreenX(10)).toBeCloseTo(400, 10)
    expect(camera.toScreenY(20)).toBeCloseTo(300, 10)
  })
})

describe('visibleWorldRect', () => {
  it('a zoom 1 la ventana abarca tanto como píxeles hay', () => {
    const camera = new Camera()
    const rect = visibleWorldRect(camera.state, GRID_SIZE * 10, GRID_SIZE * 6)
    expect(rect.x0).toBeCloseTo(0, 10)
    expect(rect.y0).toBeCloseTo(0, 10)
    expect(rect.x1).toBeCloseTo(10, 10)
    expect(rect.y1).toBeCloseTo(6, 10)
  })

  it('tiene en cuenta el desplazamiento y el zoom', () => {
    const camera = new Camera()
    camera.panBy(-GRID_SIZE, -GRID_SIZE)
    camera.zoom = 2
    const rect = visibleWorldRect(camera.state, GRID_SIZE * 4, GRID_SIZE * 4)
    expect(rect.x0).toBeCloseTo(0.5, 10)
    expect(rect.y0).toBeCloseTo(0.5, 10)
    expect(rect.x1).toBeCloseTo(2.5, 10)
    expect(rect.y1).toBeCloseTo(2.5, 10)
  })
})
