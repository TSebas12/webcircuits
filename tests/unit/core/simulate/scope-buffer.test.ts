import { describe, expect, it } from 'vitest'
import { ScopeBuffer } from '../../../../src/core/simulate/scope-buffer'

describe('ScopeBuffer (M7-01)', () => {
  it('guarda las muestras en orden hasta llenarse', () => {
    const buffer = new ScopeBuffer<number>(3)
    buffer.add(1)
    buffer.add(2)
    buffer.add(3)

    expect(buffer.capacity).toBe(3)
    expect(buffer.size).toBe(3)
    expect(buffer.isFull).toBe(true)
    expect(buffer.toArray()).toEqual([1, 2, 3])
  })

  it('descarta la muestra más antigua al desbordar', () => {
    const buffer = new ScopeBuffer<number>(3)
    buffer.add(1)
    buffer.add(2)
    buffer.add(3)
    buffer.add(4)
    buffer.add(5)

    expect(buffer.size).toBe(3)
    expect(buffer.toArray()).toEqual([3, 4, 5])
  })

  it('funciona con una sola muestra de capacidad', () => {
    const buffer = new ScopeBuffer<string>(1)
    buffer.add('a')
    buffer.add('b')

    expect(buffer.toArray()).toEqual(['b'])
    expect(buffer.isFull).toBe(true)
  })

  it('vacío devuelve un arreglo vacío', () => {
    const buffer = new ScopeBuffer<number>(4)
    expect(buffer.toArray()).toEqual([])
    expect(buffer.size).toBe(0)
    expect(buffer.isFull).toBe(false)
  })

  it('clear vacía el buffer sin cambiar la capacidad', () => {
    const buffer = new ScopeBuffer<number>(2)
    buffer.add(1)
    buffer.add(2)
    buffer.clear()

    expect(buffer.capacity).toBe(2)
    expect(buffer.size).toBe(0)
    expect(buffer.isFull).toBe(false)
    expect(buffer.toArray()).toEqual([])
    buffer.add(3)
    expect(buffer.toArray()).toEqual([3])
  })

  it('rechaza capacidades no positivas', () => {
    expect(() => new ScopeBuffer<number>(0)).toThrow()
    expect(() => new ScopeBuffer<number>(-4)).toThrow()
  })
})