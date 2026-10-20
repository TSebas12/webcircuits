import { describe, expect, it } from 'vitest'
import { clampZoom, visibleWindow, zoomIn, zoomOut } from '../../../src/app/components/oscilloscope/oscilloscope-view'

describe('controles del osciloscopio (M7-03)', () => {
  it('acercar reduce la ventana visible', () => {
    const samples = [0, 1, 2, 3, 4, 5, 6, 7]
    expect(visibleWindow(samples, 2)).toEqual([4, 5, 6, 7])
    expect(visibleWindow(samples, 4)).toEqual([6, 7])
  })

  it('alejar no muestra más de lo disponible', () => {
    const samples = [0, 1, 2, 3]
    expect(visibleWindow(samples, 0.5)).toEqual(samples)
  })

  it('sin muestras devuelve vacío', () => {
    expect(visibleWindow([], 2)).toEqual([])
  })

  it('el zoom se acota', () => {
    expect(zoomIn(8)).toBe(16)
    expect(zoomIn(16)).toBe(16)
    expect(zoomOut(1 / 8)).toBe(1 / 8)
    expect(clampZoom(100)).toBe(16)
    expect(clampZoom(0)).toBe(1 / 8)
    expect(clampZoom(Number.NaN)).toBe(1)
  })
})