import { beforeAll, describe, expect, it } from 'vitest'
import { GRID_SIZE } from '../../../src/render/geometry'
import { drawDevice, drawPinDot, drawWire } from '../../../src/render/draw'
import type { DrawDevice, DrawPinDot, DrawWire } from '../../../src/render/ir-renderer'
import { installFakePath2D, makeFakeContext } from '../support/canvas'
import { TEST_THEME as THEME } from '../support/theme'

beforeAll(() => {
  installFakePath2D()
})

function device(overrides: Partial<DrawDevice> = {}): DrawDevice {
  return {
    kind: 'device',
    shape: 'and',
    position: { x: 8, y: 2 },
    rotation: 'up',
    width: 3,
    height: 4,
    selected: false,
    state: 'off',
    ...overrides,
  }
}

describe('dibujar un cable', () => {
  const wire: DrawWire = { kind: 'wire', p1: { x: 4, y: 3 }, p2: { x: 8, y: 3 }, selected: false }

  it('va del punto A al punto B en coordenadas del mundo, sin tocar píxeles', () => {
    const { ctx, named } = makeFakeContext()
    drawWire(ctx, wire, THEME)

    expect(named('moveTo')[0]?.args).toEqual([4, 3])
    expect(named('lineTo')[0]?.args).toEqual([8, 3])
  })

  it('usa el color de cable, y el color de selección cuando está seleccionado', () => {
    const plain = makeFakeContext()
    drawWire(plain.ctx, wire, THEME)
    expect(plain.named('stroke')[0]?.strokeStyle).toBe(THEME.wire)

    const picked = makeFakeContext()
    drawWire(picked.ctx, { ...wire, selected: true }, THEME)
    expect(picked.named('stroke')[0]?.strokeStyle).toBe(THEME.selection)
  })

  it('el grosor se da en unidades de rejilla, así que el zoom lo escala solo', () => {
    const { ctx, named } = makeFakeContext()
    drawWire(ctx, wire, THEME)

    // 1,5 px de referencia sobre 18 px por celda. El transform del contexto ya lleva el
    // zoom, así que aquí no hay que multiplicar por nada.
    expect(named('stroke')[0]?.lineWidth).toBeCloseTo(1.5 / GRID_SIZE, 10)
  })
})

describe('dibujar un símbolo', () => {
  it('una compuerta corriente se rellena con el relleno normal, aunque su estado sea 1', () => {
    // El cuerpo de una compuerta no es un indicador: no cambia de color con el valor.
    const { ctx, named } = makeFakeContext()
    drawDevice(ctx, device({ state: 'one' }), THEME)

    expect(named('fill')[0]?.fillStyle).toBe(THEME.symbolFill)
    expect(named('fill')[0]?.shadowBlur).toBe(0)
  })

  it('se perfila con el color de símbolo, y con el de selección si está seleccionado', () => {
    const plain = makeFakeContext()
    drawDevice(plain.ctx, device(), THEME)
    expect(plain.named('stroke')[0]?.strokeStyle).toBe(THEME.symbolStroke)

    const picked = makeFakeContext()
    drawDevice(picked.ctx, device({ selected: true }), THEME)
    expect(picked.named('stroke')[0]?.strokeStyle).toBe(THEME.selection)
  })

  it('el LED es todo él un indicador: cambia de color con el estado', () => {
    const off = makeFakeContext()
    drawDevice(off.ctx, device({ shape: 'led', state: 'off' }), THEME)
    expect(off.named('fill')[0]?.fillStyle).toBe(THEME.stateOff)

    const zero = makeFakeContext()
    drawDevice(zero.ctx, device({ shape: 'led', state: 'zero' }), THEME)
    expect(zero.named('fill')[0]?.fillStyle).toBe(THEME.stateZero)

    const one = makeFakeContext()
    drawDevice(one.ctx, device({ shape: 'led', state: 'one' }), THEME)
    expect(one.named('fill')[0]?.fillStyle).toBe(THEME.stateOne)
  })

  it('solo el LED encendido suelta halo: el resto no paga ese costo', () => {
    const lit = makeFakeContext()
    drawDevice(lit.ctx, device({ shape: 'led', state: 'one' }), THEME)
    expect(lit.named('fill')[0]?.shadowBlur).toBeGreaterThan(0)

    const unlit = makeFakeContext()
    drawDevice(unlit.ctx, device({ shape: 'led', state: 'zero' }), THEME)
    expect(unlit.named('fill')[0]?.shadowBlur).toBe(0)

    const gate = makeFakeContext()
    drawDevice(gate.ctx, device({ state: 'one' }), THEME)
    expect(gate.named('fill')[0]?.shadowBlur).toBe(0)
  })

  it('el interruptor lleva dos rellenos: el cuerpo y su indicador de estado', () => {
    const { ctx, named } = makeFakeContext()
    drawDevice(ctx, device({ shape: 'button', width: 2, height: 2, state: 'one' }), THEME)

    const fills = named('fill')
    expect(fills).toHaveLength(2)
    expect(fills[0]?.fillStyle).toBe(THEME.symbolFill)
    expect(fills[1]?.fillStyle).toBe(THEME.stateOne)
  })

  it('sin girar no se rota nada; girando se usa el ángulo del original', () => {
    const straight = makeFakeContext()
    drawDevice(straight.ctx, device(), THEME)
    expect(straight.named('rotate')).toHaveLength(0)

    const turned = makeFakeContext()
    drawDevice(turned.ctx, device({ rotation: 'right' }), THEME)
    expect(turned.named('rotate')[0]?.args[0]).toBeCloseTo(Math.PI / 2, 10)
  })

  it('deja el contexto como lo encontró: lo que dibuja uno no afecta al siguiente', () => {
    const { ctx, named } = makeFakeContext()
    drawDevice(ctx, device(), THEME)

    expect(named('save')).toHaveLength(1)
    expect(named('restore')).toHaveLength(1)
  })
})

describe('dibujar un punto de pin', () => {
  const dot: DrawPinDot = { kind: 'pinDot', point: { x: 4, y: 3 }, connected: false }

  it('es un círculo del radio del original (Symbol.PinRadius = 3)', () => {
    const { ctx, named } = makeFakeContext()
    drawPinDot(ctx, dot, THEME)

    expect(named('arc')[0]?.args).toEqual([4, 3, 3 / GRID_SIZE, 0, Math.PI * 2])
  })

  it('cambia de color si el pin ya tiene un cable encima', () => {
    const free = makeFakeContext()
    drawPinDot(free.ctx, dot, THEME)
    expect(free.named('fill')[0]?.fillStyle).toBe(THEME.pinDot)

    const taken = makeFakeContext()
    drawPinDot(taken.ctx, { ...dot, connected: true }, THEME)
    expect(taken.named('fill')[0]?.fillStyle).toBe(THEME.wire)
  })
})
