// @vitest-environment jsdom
//
// El único test que monta el editor **de verdad**: documento, motor, escena y el bucle de
// dibujado, todo junto. Los demás comprueban piezas sueltas; éste es el que demuestra que
// encajan, y el que se entera si alguien cambia una firma por el camino.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Editor } from '../../../src/app/editor'
import { GRID_SIZE } from '../../../src/render/geometry'
import { installFakePath2D, makeFakeContext, type FakeContext } from '../support/canvas'

/** Los fotogramas que `requestAnimationFrame` deja apuntados, para poder dispararlos a mano. */
const frames: FrameRequestCallback[] = []

let context: FakeContext

/** La cámara arranca con el margen del editor: `mundo · 18 + (24, 80)`. */
function screenOf(worldX: number, worldY: number): { x: number; y: number } {
  return { x: 24 + worldX * GRID_SIZE, y: 80 + worldY * GRID_SIZE }
}

beforeAll(() => {
  installFakePath2D()
  context = makeFakeContext()

  // jsdom no tiene lienzo de verdad ni implementa media queries, `ResizeObserver` ni la
  // captura de puntero. Se sustituye lo justo para poder montar el editor.
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
    requestAnimationFrame: (callback: FrameRequestCallback): number => {
      frames.push(callback)
      return frames.length
    },
    cancelAnimationFrame: (): void => {},
  })

  ;(window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    addListener: (): void => {},
    removeListener: (): void => {},
    dispatchEvent: (): boolean => false,
  })

  HTMLCanvasElement.prototype.getContext = function getContext(): unknown {
    return context.ctx
  } as unknown as HTMLCanvasElement['getContext']
})

beforeEach(() => {
  frames.length = 0
  context.calls.length = 0
})

/** Ejecuta los fotogramas pendientes. El bucle se vuelve a apuntar, así que no se vacían. */
function flushFrames(): void {
  const pending = frames.splice(0, frames.length)
  for (const callback of pending) {
    callback(performance.now())
  }
}

function mount(): { editor: Editor; canvas: HTMLCanvasElement; dispose: () => void } {
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  // jsdom no implementa la captura de puntero.
  canvas.setPointerCapture = (): void => {}
  canvas.releasePointerCapture = (): void => {}
  canvas.hasPointerCapture = (): boolean => false

  const editor = new Editor()
  editor.mount(canvas)

  return {
    editor,
    canvas,
    dispose: () => {
      editor.unmount()
      canvas.remove()
    },
  }
}

/** Un `pointerdown`/`pointermove`/`pointerup` en píxeles de cliente. */
function pointer(type: string, at: { x: number; y: number }, button = 0): Event {
  const event = new MouseEvent(type, {
    clientX: at.x,
    clientY: at.y,
    button,
    bubbles: true,
  })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  return event
}

/** Un clic completo: pulsar y soltar en el mismo sitio. */
function clickAt(canvas: HTMLCanvasElement, worldX: number, worldY: number): void {
  const at = screenOf(worldX, worldY)
  canvas.dispatchEvent(pointer('pointerdown', at))
  canvas.dispatchEvent(pointer('pointerup', at))
}

function dragFromTo(
  canvas: HTMLCanvasElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  canvas.dispatchEvent(pointer('pointerdown', from))
  canvas.dispatchEvent(pointer('pointermove', to))
  canvas.dispatchEvent(pointer('pointerup', to))
}

describe('el editor monta y dibuja', () => {
  it('arranca con el lienzo vacío y no revienta', () => {
    const { editor, dispose } = mount()

    expect(editor.diagram.count).toBe(0)
    dispose()
  })

  it('el bucle de dibujado pinta la rejilla y los símbolos sin quejarse', () => {
    const { editor, dispose } = mount()
    editor.loadExample()

    context.calls.length = 0
    flushFrames()

    // De todo lo que se pide al lienzo, lo que interesa es que haya pasado por los símbolos:
    // sin el dibujado de piezas no habría ni un trazado cerrado.
    expect(context.named('fill').length).toBeGreaterThan(0)
    expect(context.named('stroke').length).toBeGreaterThan(0)

    dispose()
  })
})

describe('interacción con el ratón (M1-10 y M1-12)', () => {
  it('arrastrar un símbolo lo mueve pegado a la rejilla', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    const gate = editor.diagram.devices.find(
      (device) => device.kind === 'gate' && device.gateType === 'and',
    )
    expect(gate).toBeDefined()
    if (gate === undefined) {
      return
    }

    // Se agarra por dentro del símbolo (es 3×4 y va de (8,2) a (11,6)) y se suelta 3
    // celdas a la izquierda y 1 abajo.
    dragFromTo(canvas, screenOf(9, 3), screenOf(6, 4))

    const moved = editor.diagram.get(gate.id)
    expect(moved?.kind === 'gate' ? moved.position : null).toEqual({ x: 5, y: 3 })

    dispose()
  })

  it('un clic sin arrastre no mueve nada: selecciona', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    const gate = editor.diagram.devices.find(
      (device) => device.kind === 'gate' && device.gateType === 'and',
    )
    expect(gate).toBeDefined()
    if (gate === undefined) {
      return
    }

    clickAt(canvas, 9, 3)

    expect(editor.selection).toBe(gate.id)
    const still = editor.diagram.get(gate.id)
    expect(still?.kind === 'gate' ? still.position : null).toEqual({ x: 8, y: 2 })

    dispose()
  })

  it('arrastrar desde un pin tiende un cable nuevo', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    const before = editor.diagram.count

    // Del pin de salida de la AND (11,4) a un punto libre de la rejilla.
    dragFromTo(canvas, screenOf(11, 4), screenOf(11, 10))

    const wires = editor.diagram.elements.filter((element) => element.kind === 'wire')
    const created = wires.at(-1)

    expect(editor.diagram.count).toBe(before + 1)
    expect(created?.kind === 'wire' ? created.p1 : null).toEqual({ x: 11, y: 4 })
    expect(created?.kind === 'wire' ? created.p2 : null).toEqual({ x: 11, y: 10 })

    dispose()
  })

  it('un clic en un interruptor lo conmuta y el LED se enciende', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    // Los interruptores son 2×2 y van de (2,2) y (2,4): sus centros son (3,3) y (3,5).
    clickAt(canvas, 3, 3)
    clickAt(canvas, 3, 5)

    context.calls.length = 0
    flushFrames()

    // Si la simulación llegó al LED, alguna operación de relleno usó el color de encendido.
    const lit = context.named('fill').some((call) => call.fillStyle === '#ff4a1f')
    expect(lit).toBe(true)

    dispose()
  })

  it('`Supr` borra lo seleccionado', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    const before = editor.diagram.count
    const led = editor.diagram.devices.find(
      (device) => device.kind === 'gate' && device.gateType === 'led',
    )
    expect(led).toBeDefined()
    if (led === undefined) {
      return
    }

    clickAt(canvas, 15, 4) // centro del LED, que va de (14,3) a (16,5)
    expect(editor.selection).toBe(led.id)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))

    expect(editor.diagram.count).toBe(before - 1)
    expect(editor.diagram.get(led.id)).toBeUndefined()

    dispose()
  })

  it('la paleta coloca un símbolo donde se hace clic y no encima de otro', () => {
    const { editor, canvas, dispose } = mount()

    editor.setTool('and')
    clickAt(canvas, 10, 10)

    expect(editor.diagram.count).toBe(1)

    // Centrada: una AND de 3×4 con el clic en (10,10) queda en (9,8).
    const placed = editor.diagram.devices[0]
    expect(placed?.kind === 'gate' ? placed.position : null).toEqual({ x: 9, y: 8 })

    // Otro clic en el mismo sitio no apila nada.
    clickAt(canvas, 10, 10)
    expect(editor.diagram.count).toBe(1)

    dispose()
  })
})
