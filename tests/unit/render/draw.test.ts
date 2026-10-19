import { beforeAll, describe, expect, it } from 'vitest'
import { GRID_SIZE } from '../../../src/render/geometry'
import { drawDevice, drawJunction, drawPinDot, drawWire } from '../../../src/render/draw'
import type {
  DrawDevice,
  DrawJunction,
  DrawPinDot,
  DrawWire,
} from '../../../src/render/ir-renderer'
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
  const wire: DrawWire = {
    kind: 'wire',
    p1: { x: 4, y: 3 },
    p2: { x: 8, y: 3 },
    selected: false,
    signal: 'idle',
    bus: false,
  }

  it('va del punto A al punto B en coordenadas del mundo, sin tocar píxeles', () => {
    const { ctx, named } = makeFakeContext()
    drawWire(ctx, wire, THEME)

    expect(named('moveTo')[0]?.args).toEqual([4, 3])
    expect(named('lineTo')[0]?.args).toEqual([8, 3])
  })

  it('usa el color del estado; y el de selección cuando está seleccionado', () => {
    const plain = makeFakeContext()
    drawWire(plain.ctx, wire, THEME)
    expect(plain.named('stroke')[0]?.strokeStyle).toBe(THEME.wireIdle)

    const picked = makeFakeContext()
    drawWire(picked.ctx, { ...wire, selected: true }, THEME)
    expect(picked.named('stroke')[0]?.strokeStyle).toBe(THEME.wireSelected)
  })

  it('cambia de color según la señal (M6-03)', () => {
    const high = makeFakeContext()
    drawWire(high.ctx, { ...wire, signal: 'high' }, THEME)
    expect(high.named('stroke')[0]?.strokeStyle).toBe(THEME.wireHigh)

    const low = makeFakeContext()
    drawWire(low.ctx, { ...wire, signal: 'low' }, THEME)
    expect(low.named('stroke')[0]?.strokeStyle).toBe(THEME.wireLow)

    const floating = makeFakeContext()
    drawWire(floating.ctx, { ...wire, signal: 'floating' }, THEME)
    expect(floating.named('stroke')[0]?.strokeStyle).toBe(THEME.wireFloating)
  })

  it('un bus va más grueso y con su propio color (M6-15)', () => {
    const plain = makeFakeContext()
    drawWire(plain.ctx, wire, THEME)
    const plainWidth = Number(plain.named('stroke')[0]?.lineWidth)

    const bus = makeFakeContext()
    drawWire(bus.ctx, { ...wire, bus: true }, THEME)
    expect(bus.named('stroke')[0]?.strokeStyle).toBe(THEME.wireBus)
    expect(Number(bus.named('stroke')[0]?.lineWidth)).toBeGreaterThan(plainWidth)
  })

  it('el hover se resalta y el cable seleccionado enseña tiradores (M6-06)', () => {
    const hover = makeFakeContext()
    drawWire(hover.ctx, { ...wire, hovered: true }, THEME)
    expect(hover.named('stroke')[0]?.strokeStyle).toBe(THEME.hover)

    const picked = makeFakeContext()
    drawWire(picked.ctx, { ...wire, selected: true }, THEME)
    expect(picked.named('fillRect').some((call) => call.fillStyle === THEME.handle)).toBe(true)
  })

  it('un cable flotante va discontinuo, para no depender solo del color (M6-11)', () => {
    const solid = makeFakeContext()
    drawWire(solid.ctx, wire, THEME)
    expect(solid.named('stroke')[0]?.lineDash).toEqual([])

    const floating = makeFakeContext()
    drawWire(floating.ctx, { ...wire, signal: 'floating' }, THEME)
    expect(floating.named('stroke')[0]?.lineDash.length).toBeGreaterThan(0)
  })

  it('un color forzado a mano gana al color por estado (M6-14)', () => {
    const { ctx, named } = makeFakeContext()
    drawWire(ctx, { ...wire, signal: 'high', color: '#123456' }, THEME)
    expect(named('stroke')[0]?.strokeStyle).toBe('#123456')
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

  it('el hover se resalta, pero la selección manda (M6-06)', () => {
    const hover = makeFakeContext()
    drawDevice(hover.ctx, device({ hovered: true }), THEME)
    expect(hover.named('stroke')[0]?.strokeStyle).toBe(THEME.hover)

    const both = makeFakeContext()
    drawDevice(both.ctx, device({ hovered: true, selected: true }), THEME)
    expect(both.named('stroke')[0]?.strokeStyle).toBe(THEME.selection)
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
    expect(taken.named('fill')[0]?.fillStyle).toBe(THEME.wireIdle)
  })

  it('mientras se tiende un cable se dibuja más grande, para ver dónde acabar', () => {
    const calm = makeFakeContext()
    drawPinDot(calm.ctx, dot, THEME)
    const plainRadius = Number(calm.named('arc')[0]?.args[2])

    const wiring = makeFakeContext()
    drawPinDot(wiring.ctx, { ...dot, emphasized: true }, THEME)

    expect(Number(wiring.named('arc')[0]?.args[2])).toBeGreaterThan(plainRadius)
  })
})

describe('dibujar el punto de unión', () => {
  const junction: DrawJunction = { kind: 'junction', point: { x: 5, y: 0 } }

  it('es un círculo del mismo tamaño que un pin, en el punto exacto', () => {
    const { ctx, named } = makeFakeContext()
    drawJunction(ctx, junction, THEME)

    // El original lo dibuja con `2 * Symbol.PinRadius` de diámetro: el mismo que un pin.
    expect(named('arc')[0]?.args).toEqual([5, 0, 3 / GRID_SIZE, 0, Math.PI * 2])
  })

  it('va del color del cable, como en el original', () => {
    const { ctx, named } = makeFakeContext()
    drawJunction(ctx, junction, THEME)

    // En el original `WireStroke` y `JamDirectFill` son el mismo pincel (`Brushes.Black`),
    // así que la unión no se distingue del cable por color sino por ser más gruesa.
    expect(named('fill')[0]?.fillStyle).toBe(THEME.wireIdle)
  })
})
