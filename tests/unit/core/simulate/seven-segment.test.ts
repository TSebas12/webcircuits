import { describe, expect, it } from 'vitest'
import { Diagram } from '../../../../src/core/model/diagram'
import { placedPins } from '../../../../src/core/model/layout'
import { projectIndex } from '../../../../src/core/model/symbol'
import { CircuitRunner } from '../../../../src/core/simulate/circuit-runner'
import {
  deviceSegmentsSnapshot,
  devicesSnapshot,
} from '../../../../src/core/simulate/snapshot'
import { PIECES, findPiece, pieceShape } from '../../../../src/app/palette'
import { symbolDrawing } from '../../../../src/render/symbols'
import type { Circuit, Element, Project } from '../../../../src/core/model/types'
import { installFakePath2D } from '../../support/canvas'

installFakePath2D()

function projectOf(elements: readonly Element[]): Project {
  const circuit: Circuit = { id: 'main', name: 'Main', elements }
  return { id: 'p', name: 'P', mainCircuitId: 'main', circuits: [circuit] }
}

/**
 * Cablea una constante de 1 o 0 a una punta de entrada.
 *
 * `side` es el lado por el que sale la constante: `right` para una entrada del lado
 * izquierdo del display y `left` para una del lado derecho.
 */
function feedPin(
  diagram: Diagram,
  point: { x: number; y: number },
  value: number,
  side: 'left' | 'right',
): void {
  const constant = diagram.addConstant(
    // El cable tiene que medir algo: un cable de longitud cero no llega a conectar.
    side === 'right' ? { x: point.x - 3, y: point.y - 1 } : { x: point.x + 1, y: point.y - 1 },
    { bitWidth: 1, value, pinSide: side },
  )
  const output = placedPins(constant).find((pin) => pin.pin.type === 'output')!
  diagram.addWire(output.point, point)
}

describe('display de 7 segmentos (M2-05)', () => {
  it('la paleta lo dibuja como display y no como el LED redondo', () => {
    const piece = findPiece('sevenSegment')

    expect(pieceShape(piece)).toBe('sevenSegment')
    const drawing = symbolDrawing('sevenSegment', 3, 5)
    expect(drawing.segments).toHaveLength(8)
    expect(drawing.segmentWidth).toBeGreaterThan(0)
  })

  it('cada segmento se enciende con su propia entrada', () => {
    const diagram = new Diagram()
    const display = diagram.addGate('led', { x: 6, y: 0 }, 8)
    const pins = placedPins(display)
      .filter((pin) => pin.pin.type === 'input')
      .sort((a, b) => a.pin.order - b.pin.order)

    // a = 1, b = 0, e = 1; el resto queda sin cablear (apagado).
    feedPin(diagram, pins[0]!.point, 1, 'right')
    feedPin(diagram, pins[1]!.point, 0, 'right')
    feedPin(diagram, pins[4]!.point, 1, 'left')

    const elements = diagram.elements
    const project = projectOf(elements)
    const index = projectIndex(project)
    const runner = new CircuitRunner(index, index.circuit('main')!)
    const state = runner.turnOn()
    runner.step(false)

    const segments = deviceSegmentsSnapshot(index, runner.circuitMap, state, elements)
    expect(segments.get(display.id)).toEqual([
      'one',
      'zero',
      'off',
      'off',
      'one',
      'off',
      'off',
      'off',
    ])

    // El estado global del display sigue siendo «algo encendido»: no rompe el render.
    expect(devicesSnapshot(index, runner.circuitMap, state, elements).get(display.id)).toBe('one')
  })

  it('el altavoz se simula como indicador y no tumba la corriente', () => {
    const diagram = new Diagram()
    const sound = diagram.addSound({ x: 6, y: 0 })
    const input = placedPins(sound).find((pin) => pin.pin.type === 'input')!
    feedPin(diagram, input.point, 1, 'right')

    const elements = diagram.elements
    const project = projectOf(elements)
    const index = projectIndex(project)
    const runner = new CircuitRunner(index, index.circuit('main')!)
    const state = runner.turnOn()
    runner.step(false)

    expect(devicesSnapshot(index, runner.circuitMap, state, elements).get(sound.id)).toBe('one')
  })

  it('las matrices que aún no se pueden cablear no se ofrecen en la paleta', () => {
    const kinds: readonly string[] = PIECES.map((piece) => piece.kind)
    expect(kinds).not.toContain('graphicsArray')
    expect(kinds).not.toContain('ledMatrix')
  })
})
