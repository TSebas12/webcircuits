// @vitest-environment jsdom
//
// El único test que monta el editor **de verdad**: documento, motor, escena y el bucle de
// dibujado, todo junto. Los demás comprueban piezas sueltas; éste es el que demuestra que
// encajan, y el que se entera si alguien cambia una firma por el camino.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Editor, type EditorCallbacks, type HistoryState, type Tool } from '../../../src/app/editor'
import { MAX_GATE_INPUTS, MIN_PIECE_INPUTS, findPiece } from '../../../src/app/palette'
import { GRID_SIZE } from '../../../src/render/geometry'
import type { Element } from '../../../src/core/model/types'
import { DEFAULT_LAYER_ID } from '../../../src/core/model/types'
import { placedPins } from '../../../src/core/model/layout'
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

function mount(
  callbacks: EditorCallbacks = {},
  options: Parameters<Editor['mount']>[1] = {},
): {
  editor: Editor
  canvas: HTMLCanvasElement
  dispose: () => void
} {
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  // jsdom no implementa la captura de puntero.
  canvas.setPointerCapture = (): void => {}
  canvas.releasePointerCapture = (): void => {}
  canvas.hasPointerCapture = (): boolean => false

  const editor = new Editor(callbacks)
  editor.mount(canvas, options)

  return {
    editor,
    canvas,
    dispose: () => {
      editor.unmount()
      canvas.remove()
    },
  }
}

/** Cuántos puntos ha pedido dibujar el lienzo: pines y uniones. Los dibuja con `arc`. */
function dotCount(): number {
  context.calls.length = 0
  flushFrames()
  return context.named('arc').length
}

/** Aleja la vista lo suficiente para que los pines libres dejen de dibujarse. */
function zoomOut(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 1200, bubbles: true, cancelable: true }))
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

/** Un clic con Ctrl/Cmd: añade o quita de la selección sin arrastrar. */
function ctrlClickAt(canvas: HTMLCanvasElement, worldX: number, worldY: number): void {
  const at = screenOf(worldX, worldY)
  const down = new MouseEvent('pointerdown', {
    clientX: at.x,
    clientY: at.y,
    button: 0,
    ctrlKey: true,
    bubbles: true,
  })
  Object.defineProperty(down, 'pointerId', { value: 1 })
  canvas.dispatchEvent(down)
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

  it('al mover una pieza, los cables pegados a sus pines van con ella', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    const gate = editor.diagram.devices.find(
      (device) => device.kind === 'gate' && device.gateType === 'and',
    )
    expect(gate).toBeDefined()
    if (gate === undefined) {
      return
    }

    // Cable de salida del AND hacia el LED: (11, 4) -> (14, 4). Su extremo en (11, 4) está
    // pegado al pin de salida del AND, así que al mover el AND ese extremo se desplaza con él
    // y el otro (el del LED) se queda donde estaba.
    const wire = editor.diagram.elements.find(
      (candidate) =>
        candidate.kind === 'wire' &&
        candidate.p1.x === 11 &&
        candidate.p1.y === 4 &&
        candidate.p2.x === 14 &&
        candidate.p2.y === 4,
    )
    expect(wire).toBeDefined()
    if (wire === undefined) {
      return
    }

    dragFromTo(canvas, screenOf(9, 3), screenOf(6, 4))

    const movedWire = editor.diagram.get(wire.id)
    expect(movedWire?.kind === 'wire' ? movedWire.p1 : null).toEqual({ x: 8, y: 5 })
    expect(movedWire?.kind === 'wire' ? movedWire.p2 : null).toEqual({ x: 14, y: 4 })

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

  it('cablear también funciona con dos clics: uno en cada pin', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    const before = editor.diagram.count

    // Primer clic: el cable queda armado, no se tiende todavía.
    clickAt(canvas, 11, 4)
    expect(editor.diagram.count).toBe(before)

    // Segundo clic en la rejilla: ahí acaba.
    clickAt(canvas, 11, 10)

    const wires = editor.diagram.elements.filter((element) => element.kind === 'wire')
    const created = wires.at(-1)
    expect(editor.diagram.count).toBe(before + 1)
    expect(created?.kind === 'wire' ? created.p1 : null).toEqual({ x: 11, y: 4 })
    expect(created?.kind === 'wire' ? created.p2 : null).toEqual({ x: 11, y: 10 })

    dispose()
  })

  it('la cámara deja el origen a la derecha del hueco que tapa la paleta', () => {
    const { editor, dispose } = mount({}, { insets: { left: 200 } })

    // Margen inicial (24) + hueco de la paleta (200). Sin esto, el ejemplo y los proyectos
    // guardados con coordenadas pequeñas se dibujaban debajo de la paleta.
    expect(editor.cameraState.offsetX).toBe(224)

    dispose()
  })

  it('una capa bloqueada no se borra ni se gira aunque esté seleccionada', () => {
    const { editor, dispose } = mount()
    editor.loadExample()

    const gate = editor.diagram.devices[0]!
    editor.diagram.setLayerLocked('principal', true)
    editor.select(gate.id)

    const before = editor.diagram.count
    editor.removeSelected()
    expect(editor.diagram.count).toBe(before)

    editor.rotateSelection()
    const rotated = editor.diagram.get(gate.id)
    expect(rotated?.kind === 'wire' ? null : rotated?.rotation).toBe(gate.rotation)

    // Al desbloquear, la misma acción sí surte efecto.
    editor.diagram.setLayerLocked('principal', false)
    editor.select(gate.id)
    editor.removeSelected()
    expect(editor.diagram.count).toBeLessThan(before)

    dispose()
  })

  it('con la corriente puesta el inspector no cambia la pieza', () => {
    const { editor, dispose } = mount()
    const gate = editor.diagram.addGate('and', { x: 0, y: 0 }, 2)
    editor.select(gate.id)
    editor.setPowered(true)

    editor.updateSelected({ bitWidth: 4 })

    const current = editor.diagram.get(gate.id)
    expect(current?.kind === 'gate' ? current.bitWidth : null).toBe(1)
    dispose()
  })

  it('un clic en un interruptor lo elige, y sin corriente no lo pulsa', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    // Los interruptores son 2×2 y van de (2,2) y (2,4): sus centros son (3,3) y (3,5).
    clickAt(canvas, 3, 3)
    clickAt(canvas, 3, 5)

    // Sin corriente no se pulsa nada: en modo edición el clic elige la pieza, que es lo que
    // hace falta para poder moverla. Para probar el circuito hay que dar corriente (se
    // comprueba más abajo, en su bloque).
    expect(editor.selection).not.toBeNull()

    context.calls.length = 0
    flushFrames()
    expect(context.named('fill').some((call) => call.fillStyle === '#ff4a1f')).toBe(false)

    dispose()
  })

  it('`Supr` borra lo seleccionado, y si es un símbolo se lleva sus cables (M2-21)', () => {
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

    // Se van el LED **y el cable que le llegaba**: el criterio de «hecho» de M2-21 es justo
    // ese, que no queden cables huérfanos apuntando a una pieza que ya no está.
    expect(editor.diagram.count).toBe(before - 2)
    expect(editor.diagram.get(led.id)).toBeUndefined()
    const dangling = editor.diagram.elements.filter(
      (element) => element.kind === 'wire' && element.p2.x === 14 && element.p2.y === 4,
    )
    expect(dangling).toHaveLength(0)

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

    // Otro clic en el mismo sitio no apila nada: cae sobre el símbolo, y ahí el clic
    // interactúa con él. Se comprueba a fondo en el bloque siguiente.
    clickAt(canvas, 10, 10)
    expect(editor.diagram.count).toBe(1)
    expect(editor.selection).toBe(placed?.id)

    dispose()
  })
})

describe('la herramienta de colocación ya no se come los clics', () => {
  it('con ∧ puesta, un clic en un interruptor lo elige y no coloca nada', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    // Éste era el fallo: la herramienta se queda puesta después de colocar, así que el clic
    // intentaba poner otro símbolo encima, se encontraba la celda ocupada y **no hacía nada
    // en absoluto**: ni colocaba ni elegía. El interruptor parecía muerto.
    const before = editor.diagram.count
    const button = editor.diagram.devices.find((device) => device.kind === 'button')
    expect(button).toBeDefined()
    if (button === undefined) {
      return
    }

    editor.setTool('and')
    clickAt(canvas, 3, 3) // centro del interruptor de arriba

    expect(editor.diagram.count).toBe(before)
    expect(editor.selection).toBe(button.id)

    dispose()
  })

  it('con ∧ puesta, un clic en el vacío sí coloca', () => {
    const { editor, canvas, dispose } = mount()

    editor.setTool('and')
    clickAt(canvas, 10, 10)

    expect(editor.diagram.count).toBe(1)

    dispose()
  })

  it('con ∧ puesta, un clic sobre un cable coloca igual: un cable es demasiado fino', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    const before = editor.diagram.count
    editor.setTool('and')

    // (6,3) cae en mitad del cable que va del interruptor a la AND. Acertar un cable tan
    // fino cuando se está colocando sería una molestia, así que ahí manda la herramienta.
    clickAt(canvas, 6, 3)

    expect(editor.diagram.count).toBe(before + 1)

    dispose()
  })
})

describe('los dos modos los gobierna la corriente (fidelidad del original)', () => {
  it('arranca apagado, o sea en modo edición', () => {
    const { editor, dispose } = mount()

    // En el original `Editor.Power` es `CircuitRunner != null`: no hay corriente hasta que el
    // usuario la enciende, así que la aplicación abre en modo edición.
    expect(editor.isPowered).toBe(false)

    dispose()
  })

  it('con la corriente apagada, el LED no se pinta encendido', () => {
    const { editor, dispose } = mount()
    editor.loadExample()

    context.calls.length = 0
    flushFrames()

    // Éste era el susto: al abrir la aplicación todo salía con el color de «hay corriente»,
    // y el LED en 0 es de un rojo oscuro que parece encendido. Apagada, el LED se pinta con
    // el color de «sin corriente» y no queda ninguna duda.
    const fills = context.named('fill').map((call) => call.fillStyle)
    expect(fills).toContain('#b7c9b8')
    expect(fills).not.toContain('#ff4a1f')

    dispose()
  })

  it('con la corriente puesta, el clic en un interruptor lo pulsa y el LED se enciende', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()
    editor.setPowered(true)

    clickAt(canvas, 3, 3)
    clickAt(canvas, 3, 5)

    context.calls.length = 0
    flushFrames()
    expect(context.named('fill').some((call) => call.fillStyle === '#ff4a1f')).toBe(true)

    dispose()
  })

  it('bloquear una capa no impide probar el circuito: los interruptores siguen pulsándose', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()
    // Bloquear protege el **documento**, no la simulación. Antes, este candado también
    // cortaba el clic en los interruptores y parecía que el circuito no respondía.
    editor.diagram.setLayerLocked(DEFAULT_LAYER_ID, true)
    editor.setPowered(true)

    clickAt(canvas, 3, 3)
    clickAt(canvas, 3, 5)

    context.calls.length = 0
    flushFrames()
    expect(context.named('fill').some((call) => call.fillStyle === '#ff4a1f')).toBe(true)

    dispose()
  })

  it('si el navegador rechaza capturar el puntero, los gestos siguen funcionando', () => {
    const wiring: boolean[] = []
    const { editor, canvas, dispose } = mount({ onWiringChange: (value) => wiring.push(value) })
    editor.loadExample()

    // `setPointerCapture` lanza `NotFoundError` si el puntero ya no está activo. Antes, esa
    // excepción abortaba `pointerdown` entero y dejaban de responder mover, cablear y pulsar
    // interruptores —los tres gestos que empiezan justo después—, mientras colocar seguía.
    canvas.setPointerCapture = () => {
      throw new DOMException('sin puntero activo', 'NotFoundError')
    }
    canvas.releasePointerCapture = () => {
      throw new DOMException('sin puntero activo', 'NotFoundError')
    }
    canvas.hasPointerCapture = () => false

    // Mover la AND sigue funcionando.
    dragFromTo(canvas, screenOf(9, 3), screenOf(6, 4))
    const gate = editor.diagram.devices.find(
      (device) => device.kind === 'gate' && device.gateType === 'and',
    )
    expect(gate?.kind === 'gate' ? gate.position : null).toEqual({ x: 5, y: 3 })

    // Empezar un cable desde el pin de salida del primer interruptor (4,3).
    clickAt(canvas, 4, 3)
    expect(wiring.at(-1)).toBe(true)

    // Y con corriente, el interruptor se pulsa (el LED se enciende).
    editor.setPowered(true)
    clickAt(canvas, 3, 3)
    clickAt(canvas, 3, 5)
    context.calls.length = 0
    flushFrames()
    expect(context.named('fill').some((call) => call.fillStyle === '#ff4a1f')).toBe(true)

    dispose()
  })

  it('con la corriente puesta no se mueve, ni se coloca, ni se elige nada', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()
    const before = editor.diagram.count

    const gate = editor.diagram.devices.find(
      (device) => device.kind === 'gate' && device.gateType === 'and',
    )
    expect(gate).toBeDefined()
    if (gate === undefined) {
      return
    }

    editor.setPowered(true)

    // Arrastrar un símbolo no lo mueve: el gesto acaba desplazando la vista, que eso no toca
    // el circuito. Es el `InEditMode` del original, que desactiva la edición entera.
    dragFromTo(canvas, screenOf(9, 3), screenOf(6, 4))
    const still = editor.diagram.get(gate.id)
    expect(still?.kind === 'gate' ? still.position : null).toEqual({ x: 8, y: 2 })
    expect(editor.selection).toBeNull()

    // Un clic en el vacío tampoco coloca.
    clickAt(canvas, 20, 20)
    expect(editor.diagram.count).toBe(before)

    dispose()
  })

  it('con la corriente puesta, `Supr` tampoco borra', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    clickAt(canvas, 15, 4) // el LED
    expect(editor.selection).not.toBeNull()

    const before = editor.diagram.count
    editor.setPowered(true)
    // Dar corriente quita la selección, así que el `Supr` de después va «a ciegas»: lo que se
    // comprueba es que la tecla no hace nada mientras el circuito corre.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))

    expect(editor.diagram.count).toBe(before)

    dispose()
  })

  it('dar corriente quita la selección: si no se puede editar, nada debe verse marcado', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    clickAt(canvas, 9, 3) // selecciona la AND
    expect(editor.selection).not.toBeNull()

    editor.setPowered(true)

    expect(editor.selection).toBeNull()

    dispose()
  })

  it('volver a dar corriente reinicia los interruptores, como el original', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()
    editor.setPowered(true)

    clickAt(canvas, 3, 3)
    clickAt(canvas, 3, 5)

    context.calls.length = 0
    flushFrames()
    expect(context.named('fill').some((call) => call.fillStyle === '#ff4a1f')).toBe(true)

    editor.setPowered(false)
    editor.setPowered(true)

    context.calls.length = 0
    flushFrames()
    // Dar corriente vuelve a aplanar el circuito (`CircuitMap.Apply` → `new FunctionButton`),
    // así que los interruptores arrancan en su sitio: un conmutador a medio pulsar no
    // sobrevive a un apagón. No es que el editor se olvide de nada —es que el circuito que
    // corre después es otro—, y es justo lo que hace el original.
    expect(context.named('fill').some((call) => call.fillStyle === '#ff4a1f')).toBe(false)

    dispose()
  })
})

describe('la herramienta avisa cuando cambia', () => {
  it('`Esc` vuelve a «seleccionar» y lo comunica, para que la barra no se quede desfasada', () => {
    const changes: Tool[] = []
    const { editor, dispose } = mount({ onToolChange: (value) => changes.push(value) })

    editor.setTool('and')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(editor.currentTool).toBe('select')
    expect(changes).toEqual(['and', 'select'])

    dispose()
  })

  it('elegir la herramienta que ya está puesta no avisa de nada', () => {
    const changes: Tool[] = []
    const { editor, dispose } = mount({ onToolChange: (value) => changes.push(value) })

    editor.setTool('select')

    expect(changes).toEqual([])

    dispose()
  })
})

describe('los pines se ven', () => {
  it('un pin libre se dibuja de cerca, desaparece de lejos y vuelve al cablearlo', () => {
    const { editor, canvas, dispose } = mount()
    // Un interruptor suelto: su único pin no tiene nada.
    editor.diagram.addButton({ x: 2, y: 2 }, { isToggle: true })

    expect(dotCount()).toBe(1)

    zoomOut(canvas)
    expect(dotCount()).toBe(0)

    // Con un cable encima pasa a estar conectado, y entonces se dibuja a cualquier zoom.
    editor.diagram.addWire({ x: 4, y: 3 }, { x: 9, y: 3 })
    expect(dotCount()).toBe(1)

    dispose()
  })

  it('los conectados no se pierden al alejarse, porque esos sí dicen algo', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    zoomOut(canvas)

    // El ejemplo tiene seis pines y los seis están cableados: los seis siguen ahí.
    expect(dotCount()).toBe(6)

    dispose()
  })

  it('con la corriente puesta no se dibuja ninguno, porque con corriente no se cablea', () => {
    const { editor, dispose } = mount()
    // Un interruptor suelto con su pin libre: en modo edición se ve.
    editor.diagram.addButton({ x: 2, y: 2 }, { isToggle: true })
    expect(dotCount()).toBe(1)

    editor.setPowered(true)

    expect(dotCount()).toBe(0)

    dispose()
  })
})

describe('deshacer y rehacer (M2-23)', () => {
  const undo = (): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
  }
  const redo = (): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }))
  }

  it('`Ctrl+Z` deshace la última colocación y `Ctrl+Y` la repone con el mismo nombre', () => {
    const { editor, canvas, dispose } = mount()

    editor.setTool('led')
    clickAt(canvas, 10, 10)
    const placed = editor.diagram.devices[0]
    expect(placed).toBeDefined()

    undo()
    expect(editor.diagram.count).toBe(0)

    redo()
    expect(editor.diagram.count).toBe(1)
    expect(editor.diagram.devices[0]?.id).toBe(placed?.id)

    dispose()
  })

  it('`Ctrl+Shift+Z` también rehace, que es donde mucha gente lo tiene en los dedos', () => {
    const { editor, canvas, dispose } = mount()

    editor.setTool('and')
    clickAt(canvas, 10, 10)

    undo()
    expect(editor.diagram.count).toBe(0)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }))
    expect(editor.diagram.count).toBe(1)

    dispose()
  })

  it('un arrastre entero es **un** deshacer, y devuelve la pieza a su sitio', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    const gate = editor.diagram.devices.find(
      (device) => device.kind === 'gate' && device.gateType === 'and',
    )
    expect(gate).toBeDefined()
    if (gate === undefined) {
      return
    }

    dragFromTo(canvas, screenOf(9, 3), screenOf(6, 4))

    undo()

    // Ni un paso atrás del arrastre: la pieza vuelve a donde estaba **antes de agarrarla**, y el
    // resto del ejemplo sigue entero.
    const back = editor.diagram.get(gate.id)
    expect(back?.kind === 'gate' ? back.position : null).toEqual({ x: 8, y: 2 })
    expect(editor.diagram.count).toBe(7)

    dispose()
  })

  it('cargar el ejemplo es **una sola** acción, aunque coloque siete cosas', () => {
    const { editor, dispose } = mount()
    editor.loadExample()
    expect(editor.diagram.count).toBe(7)

    undo()

    expect(editor.diagram.count).toBe(0)

    dispose()
  })

  it('con la corriente puesta no se deshace, porque tampoco se edita', () => {
    const { editor, canvas, dispose } = mount()

    editor.setTool('and')
    clickAt(canvas, 10, 10)
    editor.setPowered(true)

    undo()

    expect(editor.diagram.count).toBe(1)

    dispose()
  })

  it('avisa de cuándo se puede deshacer y rehacer, para que la barra encienda sus botones', () => {
    const history: HistoryState[] = []
    const { editor, canvas, dispose } = mount({
      onHistoryChange: (state) => history.push(state),
    })

    editor.setTool('led')
    clickAt(canvas, 10, 10)
    expect(history.at(-1)).toEqual({ canUndo: true, canRedo: false })

    editor.undo()
    expect(history.at(-1)).toEqual({ canUndo: false, canRedo: true })

    dispose()
  })
})

describe('el borrador y el borrado con cables (M2-21)', () => {
  it('un clic se lleva lo que toca, con los cables que colgaban de ello', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()
    editor.setTool('erase')

    // Dentro de la AND, que va de (8,2) a (11,6): se van ella y sus tres cables.
    clickAt(canvas, 9, 3)

    expect(editor.diagram.count).toBe(3)
    const remaining = editor.diagram.devices.filter(
      (device) => device.kind === 'gate' && device.gateType === 'and',
    )
    expect(remaining).toHaveLength(0)

    dispose()
  })

  it('es un modo y no una acción suelta: sigue puesto después de borrar', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    editor.setTool('erase')
    clickAt(canvas, 9, 3)

    expect(editor.currentTool).toBe('erase')

    dispose()
  })

  it('con el borrador, un cable se borra él solo y las piezas no se tocan', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()
    editor.setTool('erase')
    const before = editor.diagram.count

    // En mitad del cable (4,3)→(8,3).
    clickAt(canvas, 6, 3)

    expect(editor.diagram.count).toBe(before - 1)
    expect(editor.diagram.devices).toHaveLength(4)

    dispose()
  })

  it('sobre el vacío no borra nada', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()
    editor.setTool('erase')

    clickAt(canvas, 30, 30)

    expect(editor.diagram.count).toBe(7)

    dispose()
  })

  it('la pieza y sus cables vuelven juntos al deshacer', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()
    editor.setTool('erase')

    clickAt(canvas, 9, 3)
    expect(editor.diagram.count).toBe(3)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))

    // Cuatro cosas de una vez. Si cada una fuera su propia acción, el primer `Ctrl+Z` repondría
    // la AND dejando los cables sin reponer (o al revés).
    expect(editor.diagram.count).toBe(7)

    dispose()
  })

  it('si lo borrado era lo seleccionado, la selección se queda limpia', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample()

    clickAt(canvas, 9, 3) // se selecciona la AND
    expect(editor.selection).not.toBeNull()

    editor.setTool('erase')
    clickAt(canvas, 9, 3) // y se va con el borrador

    expect(editor.selection).toBeNull()

    dispose()
  })
})

describe('atajos de teclado', () => {
  function press(key: string, options: KeyboardEventInit = {}): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, ...options }))
  }

  it('una tecla por herramienta: `S`, `E`, `B`, `A` y `L`', () => {
    const { editor, dispose } = mount()

    const cases: readonly (readonly [string, Tool])[] = [
      ['e', 'erase'],
      ['b', 'button'],
      ['a', 'and'],
      ['l', 'led'],
      ['s', 'select'],
    ]
    for (const [key, tool] of cases) {
      press(key)
      expect(editor.currentTool).toBe(tool)
    }

    dispose()
  })

  it('`P` enciende y apaga la corriente desde cualquier modo', () => {
    const { editor, dispose } = mount()

    editor.setTool('led')
    press('p')
    expect(editor.isPowered).toBe(true)

    // Con corriente el atajo de herramienta no responde, pero `P` sí: es la salida del modo.
    press('a')
    expect(editor.currentTool).toBe('led')

    press('p')
    expect(editor.isPowered).toBe(false)

    dispose()
  })

  it('mantener pulsada la tecla de la corriente no la deja parpadeando', () => {
    const { editor, dispose } = mount()

    press('p', { repeat: true })
    expect(editor.isPowered).toBe(false)

    dispose()
  })

  it('los atajos no se comen lo que se escribe en un campo de texto', () => {
    const { editor, dispose } = mount()
    const input = document.createElement('input')
    document.body.append(input)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))

    expect(editor.currentTool).toBe('select')

    input.remove()
    dispose()
  })
})

describe('el cursor dice qué se va a hacer', () => {
  it('al empezar a cablear avisa, y al soltar también: es lo que pone la flecha en vez de la mano', () => {
    const wiring: boolean[] = []
    const { editor, canvas, dispose } = mount({ onWiringChange: (on) => wiring.push(on) })
    editor.loadExample()

    // Desde el pin de salida del primer interruptor (4,3).
    canvas.dispatchEvent(pointer('pointerdown', screenOf(4, 3)))
    expect(wiring).toEqual([true])

    // Al moverse no se repite el aviso: es un cambio de estado, no de posición.
    canvas.dispatchEvent(pointer('pointermove', screenOf(4, 10)))
    expect(wiring).toEqual([true])

    canvas.dispatchEvent(pointer('pointerup', screenOf(4, 10)))
    expect(wiring).toEqual([true, false])

    dispose()
  })

  it('cancelar el cable con `Esc` también termina el aviso, y no deja cable', () => {
    const wiring: boolean[] = []
    const { editor, canvas, dispose } = mount({ onWiringChange: (on) => wiring.push(on) })
    editor.loadExample()

    canvas.dispatchEvent(pointer('pointerdown', screenOf(4, 3)))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(wiring).toEqual([true, false])
    expect(editor.diagram.count).toBe(7)

    dispose()
  })

  it('encender la corriente en mitad del gesto también lo corta', () => {
    const wiring: boolean[] = []
    const { editor, canvas, dispose } = mount({ onWiringChange: (on) => wiring.push(on) })
    editor.loadExample()

    canvas.dispatchEvent(pointer('pointerdown', screenOf(4, 3)))
    editor.setPowered(true)

    expect(wiring).toEqual([true, false])
    expect(editor.diagram.count).toBe(7)

    dispose()
  })
})

describe('las piezas de la paleta se colocan como las crea el original (M2-27)', () => {
  /** Coloca una pieza de la paleta con un clic y devuelve lo que quedó en el circuito. */
  function placeFromPalette(editor: Editor, canvas: HTMLCanvasElement, id: Tool): Element {
    editor.setTool(id)
    clickAt(canvas, 10, 10)

    const element = editor.diagram.devices[0]
    if (element === undefined) {
      throw new Error(`no se colocó la pieza «${id}»`)
    }
    return element
  }

  it('la AND sale de dos entradas, y la NAND es la misma con la salida negada', () => {
    const { editor, canvas, dispose } = mount()

    const and = placeFromPalette(editor, canvas, 'and')
    expect(and.kind).toBe('gate')
    expect(and.kind === 'gate' && and.gateType).toBe('and')
    expect(and.kind === 'gate' && and.inputCount).toBe(2)
    expect(and.kind === 'gate' && and.invertedOutput).toBe(false)

    // Se borra la primera para poder medir la segunda sola.
    editor.diagram.remove(and.id)
    const nand = placeFromPalette(editor, canvas, 'nand')
    expect(nand.kind === 'gate' && nand.gateType).toBe('and')
    expect(nand.kind === 'gate' && nand.invertedOutput).toBe(true)

    dispose()
  })

  it('el inversor sale de una entrada y negado, como en el original', () => {
    const { editor, canvas, dispose } = mount()

    const not = placeFromPalette(editor, canvas, 'not')

    // `CircuitDescriptorList.cs` crea la NOT con `Gate(GateType.Not, 1, true)`: el triángulo y
    // su bolita. Una NOT sin negar la colocaría el motor sin función —no conduciría nada—.
    expect(not.kind === 'gate' && not.gateType).toBe('not')
    expect(not.kind === 'gate' && not.inputCount).toBe(1)
    expect(not.kind === 'gate' && not.invertedOutput).toBe(true)

    dispose()
  })

  it('los tri-estado salen con dos entradas, como los crea el original', () => {
    const { editor, canvas, dispose } = mount()

    const triState = placeFromPalette(editor, canvas, 'triState2')

    expect(triState.kind === 'gate' && triState.gateType).toBe('triState2')
    expect(triState.kind === 'gate' && triState.inputCount).toBe(2)
    expect(triState.kind === 'gate' && triState.invertedOutput).toBe(false)

    dispose()
  })

  it('las compuertas que lo permiten se colocan con las entradas que pida el panel', () => {
    const { editor, canvas, dispose } = mount()

    expect(editor.placeInputs).toBe(2)
    expect(editor.setPlaceInputs(4)).toBe(4)

    const or = placeFromPalette(editor, canvas, 'or')
    expect(or.kind === 'gate' && or.inputCount).toBe(4)
    // El hueco se mide con el número nuevo: cinco de alto, así que el clic en (10,10) deja la
    // compuerta en (9,8) y no en (9,9), que es donde la pondría una de dos entradas.
    expect(or.kind === 'wire' ? null : or.position).toEqual({ x: 9, y: 8 })

    dispose()
  })

  it('a las piezas que no tienen entradas variables el panel no las toca', () => {
    const { editor, canvas, dispose } = mount()

    editor.setPlaceInputs(6)
    const led = placeFromPalette(editor, canvas, 'led')

    expect(led.kind === 'gate' && led.inputCount).toBe(1)

    dispose()
  })

  it('el número de entradas se recorta al tope del modelo, y se devuelve el aceptado', () => {
    const { editor, dispose } = mount()

    // Quien lo pide es un campo de la interfaz: si devolviera lo escrito en vez de lo aceptado,
    // el campo se quedaría enseñando un número que no es el que se coloca.
    expect(editor.setPlaceInputs(99)).toBe(MAX_GATE_INPUTS)
    expect(editor.setPlaceInputs(0)).toBe(MIN_PIECE_INPUTS)
    expect(editor.setPlaceInputs(3.7)).toBe(3)
    expect(editor.setPlaceInputs(Number.NaN)).toBe(MIN_PIECE_INPUTS)
    expect(editor.placeInputs).toBe(MIN_PIECE_INPUTS)

    dispose()
  })

  it('cada compuerta recuerda sus propias entradas', () => {
    const { editor, canvas, dispose } = mount()

    // Como en el panel del original: cambiar la AND no toca la OR.
    expect(editor.setPaletteInput('or', 5)).toBe(5)
    expect(editor.setPaletteInput('and', 3)).toBe(3)

    const or = placeFromPalette(editor, canvas, 'or')
    expect(or.kind === 'gate' && or.inputCount).toBe(5)
    editor.diagram.remove(or.id)

    const and = placeFromPalette(editor, canvas, 'and')
    expect(and.kind === 'gate' && and.inputCount).toBe(3)

    // El recorte también se devuelve por pieza.
    expect(editor.setPaletteInput('and', 99)).toBe(MAX_GATE_INPUTS)

    dispose()
  })

  it('el repartidor se coloca con el reparto elegido en la paleta', () => {
    const { editor, canvas, dispose } = mount()

    expect(
      editor.setPaletteSplitter(findPiece('splitter-4'), {
        pinCount: 3,
        bitsPerPin: 1,
        clockwise: false,
      }),
    ).toEqual({ pinCount: 3, bitsPerPin: 1, clockwise: false })

    const splitter = placeFromPalette(editor, canvas, 'splitter-4')
    if (splitter.kind !== 'splitter') {
      throw new Error('la paleta debería colocar un repartidor')
    }

    expect(splitter.bitWidth).toBe(3)
    expect(splitter.pinCount).toBe(3)
    expect(splitter.clockwise).toBe(false)
    expect(
      placedPins(splitter)
        .filter((placed) => placed.pin.side === 'left')
        .map((placed) => placed.pin.bitWidth),
    ).toEqual([1, 1, 1])
    expect(
      placedPins(splitter).filter((placed) => placed.pin.side === 'right'),
    ).toEqual([expect.objectContaining({ pin: expect.objectContaining({ bitWidth: 3 }) })])

    dispose()
  })
})

describe('los ejemplos están cableados a pines reales (M1-15)', () => {
  function expectEveryWireOnAPin(editor: Editor): void {
    const pins = new Set<string>()
    for (const device of editor.diagram.devices) {
      for (const placed of placedPins(device, (id) => editor.project.circuit(id))) {
        pins.add(`${placed.point.x},${placed.point.y}`)
      }
    }

    const wires = editor.diagram.elements.filter((element) => element.kind === 'wire')
    expect(wires.length).toBeGreaterThan(0)
    for (const wire of wires) {
      expect(pins.has(`${wire.p1.x},${wire.p1.y}`), `extremo suelto en ${wire.p1.x},${wire.p1.y}`).toBe(true)
      expect(pins.has(`${wire.p2.x},${wire.p2.y}`), `extremo suelto en ${wire.p2.x},${wire.p2.y}`).toBe(true)
    }
  }

  it.each(['and', 'or', 'not', 'xor', 'clock'] as const)(
    'el ejemplo «%s» no deja ningún cable colgando',
    (id) => {
      const { editor, dispose } = mount()
      editor.loadExample(id)
      expectEveryWireOnAPin(editor)
      dispose()
    },
  )

  it('el inversor NOT enciende el LED con la entrada en 0 y lo apaga al pulsarla', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample('not')
    editor.setPowered(true)

    const output = editor.diagram.elements.find(
      (element) =>
        element.kind === 'wire' &&
        element.p1.x === 11 &&
        element.p1.y === 3 &&
        element.p2.x === 14 &&
        element.p2.y === 3,
    )
    expect(output).toBeDefined()
    if (output === undefined || output.kind !== 'wire') {
      dispose()
      return
    }

    expect(editor.probeValue(output)).toBe(1)
    clickAt(canvas, 3, 3)
    expect(editor.probeValue(output)).toBe(0)

    dispose()
  })

  it('el reloj a LED solo tiene el cable de salida del reloj al LED', () => {
    const { editor, dispose } = mount()
    editor.loadExample('clock')

    const wires = editor.diagram.elements.filter((element) => element.kind === 'wire')
    expect(wires).toHaveLength(1)
    expect(wires[0]?.kind === 'wire' ? wires[0].p1 : null).toEqual({ x: 4, y: 4 })
    expect(wires[0]?.kind === 'wire' ? wires[0].p2 : null).toEqual({ x: 10, y: 4 })

    dispose()
  })
})

describe('gestión de subcircuitos', () => {
  it('borrar un subcircuito se lleva sus instancias y sus cables', () => {
    const { editor, dispose } = mount()
    const sub = editor.createSubcircuit('Sumador')
    editor.enterSubcircuit(sub)
    editor.diagram.addPin({ x: 1, y: 1 }, { pinType: 'input', name: 'A' })
    editor.exitSubcircuit()

    const instance = editor.diagram.addCircuitInstance({ x: 2, y: 2 }, sub)
    const pin = placedPins(instance, (id) => editor.project.circuit(id))[0]?.point
    expect(pin).toBeDefined()
    if (pin === undefined) {
      dispose()
      return
    }
    editor.diagram.addWire(pin, { x: pin.x + 3, y: pin.y })

    expect(editor.subcircuitUseCount(sub)).toBe(1)
    expect(editor.deleteSubcircuit(sub)).toBe(true)
    expect(editor.project.circuit(sub)).toBeUndefined()
    expect(editor.diagram.storedElements.some((element) => element.kind === 'circuit')).toBe(false)
    expect(editor.diagram.storedElements.some((element) => element.kind === 'wire')).toBe(false)
    expect(editor.dirty).toBe(true)

    dispose()
  })

  it('borrar el subcircuito que se está editando vuelve al padre', () => {
    const { editor, dispose } = mount()
    const sub = editor.createSubcircuit('Resta')
    editor.enterSubcircuit(sub)
    expect(editor.currentCircuitId).toBe(sub)

    expect(editor.deleteSubcircuit(sub)).toBe(true)
    expect(editor.currentCircuitId).toBe('main')
    expect(editor.circuitPath).toEqual(['main'])

    dispose()
  })
})

describe('agrupar cables en bus (M3B-01)', () => {
  it('selecciona varios cables con Ctrl+clic y los convierte en un bus', () => {
    const { editor, canvas, dispose } = mount()
    const a = editor.diagram.addWire({ x: 0, y: 2 }, { x: 10, y: 2 })
    const b = editor.diagram.addWire({ x: 0, y: 4 }, { x: 10, y: 4 })

    clickAt(canvas, 5, 2)
    expect(editor.selectedCount).toBe(1)
    ctrlClickAt(canvas, 5, 4)
    expect(editor.selectedCount).toBe(2)
    expect(editor.canGroupSelection).toBe(true)

    expect(editor.groupSelection()).toBe(true)
    expect(editor.diagram.busGroups).toHaveLength(1)
    expect(editor.diagram.busGroups[0]?.wireIds).toEqual([a.id, b.id])
    // Los cables siguen existiendo: el bus es una vista plegada.
    expect(editor.diagram.storedElements).toHaveLength(2)
    expect(editor.selectedBusGroup).not.toBeNull()

    dispose()
  })

  it('renombra el bus seleccionado y guarda el nombre en el documento', () => {
    const { editor, dispose } = mount()
    const a = editor.diagram.addWire({ x: 0, y: 2 }, { x: 10, y: 2 })
    const b = editor.diagram.addWire({ x: 0, y: 4 }, { x: 10, y: 4 })
    editor.selectMany([a.id, b.id])
    expect(editor.groupSelection()).toBe(true)

    expect(editor.renameBusGroup('Datos')).toBe(true)
    expect(editor.selectedBusGroup?.name).toBe('Datos')

    // El nombre vacío se acepta: la etiqueta cae al nombre por defecto.
    expect(editor.renameBusGroup('')).toBe(true)
    expect(editor.selectedBusGroup?.name).toBe('')

    dispose()
  })

  it('pliega y despliega el bus sin perder sus cables ni su nombre', () => {
    const { editor, dispose } = mount()
    const a = editor.diagram.addWire({ x: 0, y: 2 }, { x: 10, y: 2 })
    const b = editor.diagram.addWire({ x: 0, y: 4 }, { x: 10, y: 4 })
    editor.selectMany([a.id, b.id])
    expect(editor.groupSelection()).toBe(true)
    const group = editor.selectedBusGroup
    expect(group).not.toBeNull()
    if (group === null) {
      dispose()
      return
    }
    editor.renameBusGroup('Datos')
    expect(group.collapsed).toBe(true)

    const at = screenOf(5, 3)
    expect(editor.hitAt(at.x, at.y)?.kind).toBe('bus')
    expect(editor.setBusGroupCollapsed(group.id, false)).toBe(true)
    expect(editor.diagram.busGroup(group.id)?.collapsed).toBe(false)
    expect(editor.diagram.busGroup(group.id)?.name).toBe('Datos')
    expect(editor.diagram.storedElements).toHaveLength(2)
    // Desplegado no hay línea sintética que intercepte el clic: se tocan los cables reales.
    expect(editor.hitAt(at.x, at.y)).toBeNull()

    expect(editor.toggleBusGroupCollapsed(group.id)).toBe(true)
    expect(editor.diagram.busGroup(group.id)?.collapsed).toBe(true)
    expect(editor.hitAt(at.x, at.y)?.kind).toBe('bus')

    dispose()
  })

  it('las salidas de un repartidor de 1 bit se agrupan en un bus visual', () => {
    const { editor, dispose } = mount()
    const splitter = editor.diagram.addSplitter(
      { x: 4, y: 0 },
      { bitWidth: 4, pinCount: 4, clockwise: true },
    )
    const thin = placedPins(splitter).filter((placed) => placed.pin.side === 'right')
    expect(thin).toHaveLength(4)

    const wires = thin.map((placed) =>
      editor.diagram.addWire(placed.point, { x: placed.point.x + 6, y: placed.point.y }),
    )
    editor.selectMany(wires.map((wire) => wire.id))
    expect(editor.canGroupSelection).toBe(true)
    expect(editor.groupSelection()).toBe(true)
    expect(editor.diagram.busGroups[0]?.wireIds).toHaveLength(4)
    // El bus es solo una vista: el repartidor y sus cuatro cables siguen intactos.
    expect(editor.diagram.get(splitter.id)?.kind).toBe('splitter')
    expect(editor.diagram.storedElements).toHaveLength(5)

    dispose()
  })

  it('el inspector lee cada bit del bus con la corriente puesta', () => {
    const { editor, canvas, dispose } = mount()
    editor.loadExample('and')
    const wires = editor.diagram.elements.filter((element) => element.kind === 'wire')
    const first = wires[0]
    const second = wires[1]
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    if (first === undefined || second === undefined) {
      dispose()
      return
    }
    editor.selectMany([first.id, second.id])
    expect(editor.groupSelection()).toBe(true)
    const group = editor.selectedBusGroup
    expect(group).not.toBeNull()
    if (group === null) {
      dispose()
      return
    }

    // Sin corriente no hay verdad eléctrica que enseñar.
    expect(editor.busGroupValues(group.id)).toEqual([null, null])
    editor.setPowered(true)
    expect(editor.busGroupValues(group.id)).toEqual([0, 0])

    // El primer interruptor es el bit 0: al pulsarlo, el bus lo refleja.
    clickAt(canvas, 3, 3)
    expect(editor.busGroupValues(group.id)).toEqual([1, 0])

    dispose()
  })

  it('un clic en la línea del bus selecciona todos sus cables y desagrupa', () => {
    const { editor, dispose } = mount()
    const a = editor.diagram.addWire({ x: 0, y: 2 }, { x: 10, y: 2 })
    const b = editor.diagram.addWire({ x: 0, y: 6 }, { x: 10, y: 6 })
    editor.selectMany([a.id, b.id])
    expect(editor.groupSelection()).toBe(true)
    editor.select(null)

    const at = screenOf(5, 4)
    const hit = editor.hitAt(at.x, at.y)
    expect(hit?.kind).toBe('bus')
    if (hit?.kind !== 'bus') {
      dispose()
      return
    }
    expect(hit.group.wireIds).toEqual([a.id, b.id])

    editor.selectMany(hit.group.wireIds)
    expect(editor.canUngroupSelection).toBe(true)
    expect(editor.ungroupSelection()).toBe(true)
    expect(editor.diagram.busGroups).toHaveLength(0)
    expect(editor.diagram.get(a.id)?.kind).toBe('wire')

    dispose()
  })

  it('no agrupa cables que no son paralelos', () => {
    const { editor, dispose } = mount()
    const a = editor.diagram.addWire({ x: 0, y: 2 }, { x: 10, y: 2 })
    const b = editor.diagram.addWire({ x: 10, y: 2 }, { x: 10, y: 8 })
    editor.selectMany([a.id, b.id])

    expect(editor.canGroupSelection).toBe(false)
    expect(editor.groupSelection()).toBe(false)
    expect(editor.diagram.busGroups).toHaveLength(0)

    dispose()
  })
})
