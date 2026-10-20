import { beforeEach, describe, expect, it } from 'vitest'
import { gateLayout } from '../../../src/core/model/layout'
import {
  cachedSymbolCount,
  clearSymbolCache,
  shapeForGate,
  symbolDrawing,
} from '../../../src/render/symbols'
import { installFakePath2D } from '../support/canvas'

/**
 * Las siluetas se construyen con `Path2D`, que no existe en Node. Se sustituye por una
 * imitación que **cuenta cuántas veces se construye una**: ése es justo el criterio de
 * M1-07 — que la geometría se haga una sola vez y se reutilice.
 */
const path2d = installFakePath2D()

beforeEach(() => {
  clearSymbolCache()
  path2d.reset()
})

describe('caché de siluetas (M1-07)', () => {
  it('la misma forma y el mismo tamaño devuelven exactamente el mismo objeto', () => {
    const first = symbolDrawing('and', 3, 4)
    const second = symbolDrawing('and', 3, 4)

    expect(second).toBe(first)
    expect(path2d.built()).toBe(1)
  })

  it('un tamaño distinto es otra silueta, porque los pines cambian de sitio', () => {
    symbolDrawing('and', 3, 4)
    symbolDrawing('and', 3, 5)

    expect(cachedSymbolCount()).toBe(2)
    expect(path2d.built()).toBe(2)
  })

  it('formas distintas no comparten entrada de caché', () => {
    symbolDrawing('and', 2, 2)
    symbolDrawing('led', 2, 2)

    expect(cachedSymbolCount()).toBe(2)
  })

  it('pedirla cien veces no construye cien siluetas: eso es lo que evita asignar en el bucle', () => {
    for (let index = 0; index < 100; index += 1) {
      symbolDrawing('and', 3, 4)
    }

    expect(path2d.built()).toBe(1)
  })

  it('el LED se pinta entero con el color del estado, porque él es el indicador', () => {
    expect(symbolDrawing('led', 2, 2).bodyFill).toBe('state')
  })

  it('el interruptor lleva indicador aparte y no se pinta con el color del estado', () => {
    const drawing = symbolDrawing('button', 2, 2)

    expect(drawing.bodyFill).toBe('symbol')
    expect(drawing.indicator).toBeDefined()
  })

  it('la compuerta AND es un cuerpo normal, sin indicador', () => {
    const drawing = symbolDrawing('and', 3, 4)

    expect(drawing.bodyFill).toBe('symbol')
    expect(drawing.indicator).toBeUndefined()
  })
})

describe('qué silueta le toca a cada compuerta', () => {
  it('cada compuerta que se puede colocar sabe dibujarse', () => {
    expect(shapeForGate('and')).toBe('and')
    expect(shapeForGate('not')).toBe('not')
    expect(shapeForGate('or')).toBe('or')
    expect(shapeForGate('xor')).toBe('xor')
    expect(shapeForGate('clock')).toBe('clock')
    expect(shapeForGate('triState1')).toBe('triState1')
    expect(shapeForGate('triState2')).toBe('triState2')
    expect(shapeForGate('led')).toBe('led')
  })

  it('las que no son compuertas devuelven `null` en vez de inventarse una forma', () => {
    expect(shapeForGate('nop')).toBeNull()
    expect(shapeForGate('odd')).toBeNull()
  })

  it('la probeta tiene su propia silueta con indicador de estado', () => {
    const drawing = symbolDrawing('probe', 2, 2)
    expect(drawing.bodyFill).toBe('symbol')
    expect(drawing.indicator).toBeDefined()
  })

  it('una compuerta negada lleva bolita, que es lo que la distingue', () => {
    // Una NAND es una AND negada: mismo cuerpo, con la salida marcada.
    expect(shapeForGate('and', true)).toBe('andNeg')
    expect(shapeForGate('or', true)).toBe('orNeg')
    expect(shapeForGate('xor', true)).toBe('xorNeg')

    const before = path2d.built()
    const drawing = symbolDrawing('andNeg', 3, 4)
    expect(drawing.bubble).toBeDefined()
    expect(drawing.body).toBeDefined()
    // Y sigue siendo una silueta cacheada como las demás: pedirla otra vez no construye nada.
    const afterFirst = path2d.built()
    expect(afterFirst).toBeGreaterThan(before)
    symbolDrawing('andNeg', 3, 4)
    expect(path2d.built()).toBe(afterFirst)
  })

  it('las compuertas que el motor no niega no se dibujan negadas', () => {
    // El motor solo niega and/or/xor/not (`circuit-map.ts`); una bolita en el LED o el reloj
    // diría algo que el circuito no hace.
    expect(shapeForGate('led', true)).toBeNull()
    expect(shapeForGate('clock', true)).toBeNull()
    expect(shapeForGate('triState1', true)).toBeNull()
  })

  it('el pin de salida de una compuerta negada queda marcado, y con él la bolita', () => {
    const plain = gateLayout('and', 2)
    const negated = gateLayout('and', 2, true)

    expect(plain.pins.at(-1)?.inverted).toBe(false)
    expect(negated.pins.at(-1)?.inverted).toBe(true)
    // Lo que **no** cambia: dónde está el pin. La bolita no mueve nada.
    expect(negated.width).toBe(plain.width)
    expect(negated.height).toBe(plain.height)
  })

  it('el tri-estado lleva su raya aparte, que solo se perfila', () => {
    const drawing = symbolDrawing('triState1', 3, 4)

    expect(drawing.bodyFill).toBe('symbol')
    expect(drawing.stroke).toBeDefined()
  })

  it('la XOR lleva la raya suelta y el reloj la onda', () => {
    expect(symbolDrawing('xor', 3, 4).stroke).toBeDefined()
    expect(symbolDrawing('clock', 2, 2).stroke).toBeDefined()
  })

  it('la OR y la NOT son solo cuerpo, como la AND', () => {
    expect(symbolDrawing('or', 3, 4).stroke).toBeUndefined()
    expect(symbolDrawing('not', 3, 4).stroke).toBeUndefined()
  })
})
