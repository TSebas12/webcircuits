import { beforeEach, describe, expect, it } from 'vitest'
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
  it('la AND y el LED ya saben dibujarse', () => {
    expect(shapeForGate('and')).toBe('and')
    expect(shapeForGate('led')).toBe('led')
  })

  it('las que faltan devuelven `null` en vez de inventarse una forma', () => {
    // Así, un circuito con compuertas de M2 se dibuja a medias en vez de reventar.
    expect(shapeForGate('or')).toBeNull()
    expect(shapeForGate('not')).toBeNull()
    expect(shapeForGate('clock')).toBeNull()
  })
})
