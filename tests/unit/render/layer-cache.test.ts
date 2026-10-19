// @vitest-environment jsdom
//
// La caché de capa estática (M2-17). Lo que hay que demostrar no es que el píxel salga
// bonito, sino que **no se vuelve a dibujar** lo que no ha cambiado: que el paneo reutiliza
// el lienzo cacheado y que un cambio de verdad sí lo rehace.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { StaticLayerCache } from '../../../src/render/layer-cache'
import { installFakePath2D, makeFakeContext, type FakeContext } from '../support/canvas'
import type { CameraState } from '../../../src/render/camera'
import type { DrawItem, RenderTheme } from '../../../src/render/ir-renderer'

/** Los contextos internos de las cachés construidas, para saber cuántas veces se rehizo. */
let built: FakeContext[] = []

class FakeOffscreenCanvas {
  width: number
  height: number
  private readonly context: FakeContext

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.context = makeFakeContext()
    built.push(this.context)
  }

  getContext(): unknown {
    return this.context.ctx
  }
}

/** Un contexto al que sí se le puede pedir que pegue la caché. */
function makePasteContext(): { ctx: CanvasRenderingContext2D; pastes: unknown[][] } {
  const fake = makeFakeContext()
  const pastes: unknown[][] = []
  ;(fake.ctx as unknown as Record<string, unknown>).drawImage = (...args: unknown[]): void => {
    pastes.push(args)
  }
  return { ctx: fake.ctx, pastes }
}

const THEME: RenderTheme = {
  background: '#000',
  gridDot: '#111',
  gridDotStrong: '#222',
  wireIdle: '#333',
  wireHigh: '#334',
  wireLow: '#335',
  wireFloating: '#336',
  wireBus: '#337',
  wireSelected: '#338',
  symbolFill: '#444',
  symbolStroke: '#555',
  gateText: '#556',
  gateError: '#557',
  selection: '#666',
  hover: '#667',
  pinDot: '#777',
  handle: '#778',
  stateOff: '#888',
  stateZero: '#999',
  stateOne: '#aaa',
}

function camera(zoom = 1, offsetX = 0, offsetY = 0): CameraState {
  return { zoom, offsetX, offsetY }
}

function device(x: number, y: number): DrawItem {
  return {
    kind: 'device',
    shape: 'and',
    position: { x, y },
    rotation: 'up',
    width: 3,
    height: 4,
    selected: false,
    state: 'off',
  }
}

beforeAll(() => {
  installFakePath2D()
  ;(globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = FakeOffscreenCanvas
})

beforeEach(() => {
  built = []
})

describe('caché de la capa estática', () => {
  it('dibuja las piezas una vez y luego solo pega el lienzo', () => {
    const cache = new StaticLayerCache()
    const { ctx, pastes } = makePasteContext()
    const items = [device(0, 0)]

    expect(cache.paint(ctx, items, camera(), 1, THEME, 1000, 600)).toBe(true)
    expect(built).toHaveLength(1)
    expect(pastes).toHaveLength(1)

    // El **paneo** no cambia las piezas: no se vuelve a construir la caché, solo se pega.
    expect(cache.paint(ctx, items, camera(1, 40, 25), 1, THEME, 1000, 600)).toBe(true)
    expect(built).toHaveLength(1)
    expect(pastes).toHaveLength(2)
  })

  it('el zoom sí rehace la caché, porque cambia la escala', () => {
    const cache = new StaticLayerCache()
    const { ctx } = makePasteContext()

    cache.paint(ctx, [device(0, 0)], camera(1), 1, THEME, 1000, 600)
    cache.paint(ctx, [device(0, 0)], camera(2), 1, THEME, 1000, 600)

    expect(built).toHaveLength(2)
  })

  it('mover una pieza rehace la caché', () => {
    const cache = new StaticLayerCache()
    const { ctx } = makePasteContext()

    cache.paint(ctx, [device(0, 0)], camera(), 1, THEME, 1000, 600)
    cache.paint(ctx, [device(0, 0)], camera(1, 40, 0), 1, THEME, 1000, 600) // mismo contenido: reutiliza
    cache.paint(ctx, [device(2, 0)], camera(1, 40, 0), 1, THEME, 1000, 600) // cambió: rehace

    expect(built).toHaveLength(2)
  })

  it('sin `drawImage` en el contexto, se aparta y deja dibujar del natural', () => {
    const cache = new StaticLayerCache()
    const bare = makeFakeContext()

    expect(cache.paint(bare.ctx, [device(0, 0)], camera(), 1, THEME, 1000, 600)).toBe(false)
    expect(built).toHaveLength(0)
  })

  it('un circuito que no cabe en un lienzo razonable se dibuja del natural', () => {
    const cache = new StaticLayerCache()
    const { ctx } = makePasteContext()

    // Dos piezas separadas por 400 celdas: a 18 px por celda se sale del límite.
    expect(cache.paint(ctx, [device(0, 0), device(400, 0)], camera(), 1, THEME, 1000, 600)).toBe(
      false,
    )
    expect(built).toHaveLength(0)
  })

  it('sin piezas no dice que haya hecho nada malo, pero tampoco pega nada', () => {
    const cache = new StaticLayerCache()
    const { ctx, pastes } = makePasteContext()

    expect(cache.paint(ctx, [], camera(), 1, THEME, 1000, 600)).toBe(true)
    expect(pastes).toHaveLength(0)
  })

  it('de una pieza a medias fuera de pantalla, pega solo la mitad visible', () => {
    const cache = new StaticLayerCache()
    const { ctx, pastes } = makePasteContext()

    // Con el mundo desplazado 20 px a la izquierda, la pieza entra recortada por el borde:
    // hay que saltarse sus primeros 20 píxeles y pegarlos a partir del borde de la pantalla.
    cache.paint(ctx, [device(0, 0)], camera(1, -20, 0), 1, THEME, 1000, 600)

    expect(pastes).toHaveLength(1)
    const args = pastes[0]
    if (args === undefined) {
      throw new Error('no se ha pegado nada')
    }
    expect(args[1]).toBe(20) // origen x dentro de la caché
    expect(args[5]).toBe(0) // destino x en la pantalla
    expect(args[3]).toBe(38) // ancho pegado: 58 − 20
  })

  it('una pieza enteramente fuera de pantalla no se pega', () => {
    const cache = new StaticLayerCache()
    const { ctx, pastes } = makePasteContext()

    // Desplazada 100 px: la pieza (58 px de ancho) queda toda a la izquierda.
    expect(cache.paint(ctx, [device(0, 0)], camera(1, -100, 0), 1, THEME, 1000, 600)).toBe(true)
    expect(pastes).toHaveLength(0)
  })
})
