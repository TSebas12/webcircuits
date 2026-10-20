// El catálogo de la paleta, probado entero: **cada** pieza que se ofrece tiene que poder
// colocarse, dibujarse y simularse. Es el criterio de M2-27 y también su trampa: una pieza que
// se coloca y luego no se ve, o que revienta al dar corriente, es peor que no ofrecerla.

import { describe, expect, it } from 'vitest'
import { PIECES, findPiece, pieceInputs, pieceLayout, pieceShape, placePiece } from '../../../src/app/palette'
import { Diagram } from '../../../src/core/model/diagram'
import {
  buttonLayout,
  circuitInstanceLayout,
  constantLayout,
  deviceBounds,
  gateLayout,
  pinLayout,
  placedPins,
  probeLayout,
  sensorLayout,
  memoryLayout,
  soundLayout,
  graphicsArrayLayout,
  ledMatrixLayout,
  splitterLayout,
  type SymbolLayout,
} from '../../../src/core/model/layout'
import { projectIndex } from '../../../src/core/model/symbol'
import { CircuitRunner } from '../../../src/core/simulate/circuit-runner'
import { FunctionProbe } from '../../../src/core/function/probes'
import { devicesSnapshot } from '../../../src/core/simulate/snapshot'
import type { DeviceState } from '../../../src/core/model/types'
import { symbolDrawing, type SymbolShape } from '../../../src/render/symbols'
import { installFakePath2D } from '../support/canvas'
import type { Circuit, Element, Project } from '../../../src/core/model/types'
import type { Piece } from '../../../src/app/palette'

/** Las siluetas se construyen con `Path2D`, que no existe en Node. */
installFakePath2D()

/**
 * Los tri-estado con la habilitación apagada **no emiten**: quedarse en «off» es lo correcto, y
 * es justo lo que los distingue de una compuerta normal. Van aparte en las pruebas para que no
 * parezca que se cuelan.
 */
const MUDOS_SIN_HABILITAR = new Set(['triState1', 'triState2'])

/**
 * Las piezas que producen una señal por sí mismas y se pueden probar con el cableado
 * genérico. Un pin de hoja es una interfaz (no tiene fuente) y un repartidor necesita un bus,
 * así que ambos van en pruebas propias.
 */
const SIGNAL_PIECES = PIECES.filter(
  (piece) =>
    (piece.kind === 'gate' ||
      piece.kind === 'button' ||
      piece.kind === 'constant' ||
      piece.kind === 'sensor') &&
    piece.id !== 'sevenSegment',
)

/** El hueco que debería reservar una pieza según el modelo. */
function modelLayout(piece: Piece): SymbolLayout {
  switch (piece.kind) {
    case 'gate':
      return gateLayout(piece.gateType, pieceInputs(piece, 2), piece.invertedOutput)
    case 'button':
      return buttonLayout(piece.inverted)
    case 'pin':
      return pinLayout({ pinType: piece.pinType, bitWidth: 1, inverted: false })
    case 'constant':
      return constantLayout({
        kind: 'constant',
        id: 'preview',
        circuitId: 'preview',
        layerId: 'preview',
        position: { x: 0, y: 0 },
        rotation: 'up',
        bitWidth: 1,
        value: piece.value,
        pinSide: 'right',
      })
    case 'probe':
      return probeLayout('left')
    case 'sensor':
      return sensorLayout('right')
    case 'memory':
      return memoryLayout(4, 4)
    case 'sound':
      return soundLayout('left')
    case 'graphicsArray':
      return graphicsArrayLayout()
    case 'ledMatrix':
      return ledMatrixLayout()
    case 'splitter':
      return splitterLayout({
        kind: 'splitter',
        id: 'preview',
        circuitId: 'preview',
        layerId: 'preview',
        position: { x: 0, y: 0 },
        rotation: 'up',
        bitWidth: piece.bitWidth,
        pinCount: piece.pinCount,
        clockwise: piece.clockwise,
      })
  }
}

/** Dónde acaba el LED de un circuito cableado, que es la señal de que la pieza conduce. */
function ledOf(elements: readonly Element[]): Element {
  const led = elements.find((element) => element.kind === 'gate' && element.gateType === 'led')
  if (led === undefined) {
    throw new Error('el circuito de la prueba no tiene LED')
  }
  return led
}

/**
 * Cablea la pieza con lo mínimo para que dé señal: un origen por cada entrada y un LED a la
 * salida.
 *
 * Los pines no se adivinan: se preguntan al modelo (`placedPins`), que es quien los sabe. Así el
 * día que cambie una geometría, esta prueba no se queda mintiendo.
 *
 * `feed` elige qué se enchufa a cada entrada. Con `'habilitado'`, a la habilitación del
 * tri-estado —el pin que mira hacia arriba o hacia abajo— le llega un **reloj**, que arranca
 * encendido; así el tri-estado conduce aunque nadie pulse nada.
 */
function wireUp(piece: Piece, inputs = 2, feed: 'botones' | 'habilitado' = 'botones'): Element[] {
  const diagram = new Diagram()
  const element = placePiece(diagram, piece, { x: 0, y: 0 }, inputs)

  if (element.kind === 'wire') {
    throw new Error('la paleta no coloca cables')
  }

  for (const placed of placedPins(element)) {
    if (placed.pin.type !== 'input') {
      continue
    }
    const isEnable = placed.pin.side === 'top' || placed.pin.side === 'bottom'
    // El reloj mide 2×2 y su salida está en (2,1); el interruptor mide 2×2 y la suya también.
    // Puesto a dos celdas del pin, el origen cae en la misma fila y el cable sale recto.
    const origin =
      feed === 'habilitado' && isEnable
        ? diagram.addGate('clock', { x: placed.point.x - 4, y: placed.point.y }, 0)
        : diagram.addButton(
            { x: placed.point.x - 4, y: placed.point.y - 1 },
            { isToggle: true },
          )
    const out = placedPins(origin).find((pin) => pin.pin.type === 'output')
    diagram.addWire(out!.point, placed.point)
  }

  for (const placed of placedPins(element)) {
    if (placed.pin.type !== 'output') {
      continue
    }
    const led = diagram.addGate('led', { x: placed.point.x + 2, y: placed.point.y - 1 }, 1)
    diagram.addWire(placed.point, placedPins(led)[0]!.point)
  }

  return diagram.elements
}

/** Enciende el circuito de esas piezas y devuelve el estado que vería el dibujo. */
function simulate(elements: Element[]) {
  const circuit: Circuit = { id: 'main', name: 'Main', elements }
  const project: Project = { id: 'p', name: 'P', mainCircuitId: 'main', circuits: [circuit] }
  const index = projectIndex(project)
  const runner = new CircuitRunner(index, index.circuit('main')!)
  const state = runner.turnOn()
  runner.step(false)

  return { devices: devicesSnapshot(index, runner.circuitMap, state, elements), elements }
}

/** Lo que ve el LED de un circuito ya simulado. */
function ledState(elements: Element[]): DeviceState | undefined {
  const { devices } = simulate(elements)
  return devices.get(ledOf(elements).id)
}

describe('el catálogo de piezas (M2-27)', () => {
  it('cada pieza tiene su identificador, y no se repite', () => {
    const ids = PIECES.map((piece) => piece.id)

    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(findPiece(id).id).toBe(id)
    }
  })

  it('todas las piezas se pueden colocar', () => {
    for (const piece of PIECES) {
      const diagram = new Diagram()
      placePiece(diagram, piece, { x: 0, y: 0 }, 2)

      expect(diagram.count, piece.id).toBe(1)
    }
  })

  it('todas se pueden dibujar: si no se viera, no estaría en la paleta', () => {
    for (const piece of PIECES) {
      const shape = pieceShape(piece)
      expect(shape, piece.id).not.toBeNull()
      if (shape !== null) {
        // No basta con que la pieza diga una forma: el registro tiene que saber construirla.
        expect(() => symbolDrawing(shape, 2, 2), piece.id).not.toThrow()
      }
    }
  })

  it('una forma desconocida cae en una caja y no rompe la vista previa', () => {
    // Protege una pestaña con HMR viejo: una pieza nueva con una silueta que aún no existe.
    expect(() => symbolDrawing('forma-futura' as SymbolShape, 2, 2)).not.toThrow()
  })

  it('todas se pueden simular: cableadas, el circuito se asienta y da señal', () => {
    for (const piece of SIGNAL_PIECES) {
      const elements = wireUp(piece)
      const { devices } = simulate(elements)
      const state = devices.get(ledOf(elements).id)

      // En el mensaje van la pieza y si conduce: cuando falle, hay que saber cuál y cómo quedó.
      // «Conduce» es que el LED vea un valor —cero o uno—, no que esté apagado del todo.
      const conducts = state === 'zero' || state === 'one'
      expect([piece.id, conducts]).toEqual([piece.id, !MUDOS_SIN_HABILITAR.has(piece.id)])
    }
  })

  it('el hueco que reserva la paleta antes de colocar es el que dice el modelo', () => {
    for (const piece of PIECES) {
      expect(pieceLayout(piece, 2), piece.id).toEqual(modelLayout(piece))
    }
  })

  it('un pin de hoja se coloca como interfaz, no como compuerta', () => {
    const diagram = new Diagram()
    const input = placePiece(diagram, findPiece('pin-input'), { x: 0, y: 0 }, 2)
    const output = placePiece(diagram, findPiece('pin-output'), { x: 6, y: 0 }, 2)
    if (input.kind !== 'pin' || output.kind !== 'pin') {
      throw new Error('la paleta debería colocar pines')
    }

    expect(diagram.elements.map((element) => element.kind)).toEqual(['pin', 'pin'])
    expect(placedPins(input)[0]?.pin.side).toBe('right')
    expect(placedPins(output)[0]?.pin.side).toBe('left')
  })

  it('un subcircuito colocado mide y expone los pines de su hoja', () => {
    // La hoja del subcircuito: un pin de entrada a la izquierda y uno de salida a la derecha.
    const sheet = new Diagram()
    sheet.addPin({ x: 0, y: 0 }, { pinType: 'input', side: 'left' })
    sheet.addPin({ x: 6, y: 0 }, { pinType: 'output', side: 'right' })
    const circuit: Circuit = { id: 'sub', name: 'Sub', elements: sheet.storedElements }

    const main = new Diagram()
    const instance = main.addCircuitInstance({ x: 2, y: 3 }, circuit.id)
    const resolve = (id: string): Circuit | undefined => (id === circuit.id ? circuit : undefined)
    const size = circuitInstanceLayout(circuit)
    const box = deviceBounds(instance, resolve)

    expect(box.x1 - box.x0).toBe(size.width)
    expect(box.y1 - box.y0).toBe(size.height)
    // Desde fuera los pines de un subcircuito son pasamanos (`none`), como en el original:
    // el sentido lo decide el circuito de dentro. Lo que importa es que estén todos y en su
    // lado, no que el mapa los llame «input» u «output».
    const pins = placedPins(instance, resolve)
    expect(pins.map((placed) => placed.pin.side)).toEqual(['left', 'right'])
    expect(pins.map((placed) => placed.pin.bitWidth)).toEqual([1, 1])
  })

  it('el repartidor ofrece un bus de entrada y sus salidas', () => {
    const diagram = new Diagram()
    const splitter = placePiece(diagram, findPiece('splitter-4'), { x: 0, y: 0 }, 2)
    if (splitter.kind !== 'splitter') {
      throw new Error('la paleta debería colocar un repartidor')
    }
    const pins = placedPins(splitter)

    expect(pins).toHaveLength(3)
    expect(pins.filter((placed) => placed.pin.side === 'left')).toEqual([
      expect.objectContaining({ pin: expect.objectContaining({ bitWidth: 4 }) }),
    ])
    expect(
      pins
        .filter((placed) => placed.pin.side === 'right')
        .map((placed) => placed.pin.bitWidth),
    ).toEqual([2, 2])
  })

  it('las entradas variables las manda quien coloca, y las fijas no', () => {
    const and = findPiece('and')
    const not = findPiece('not')

    expect(pieceInputs(and, 5)).toBe(5)
    expect(pieceInputs(not, 5)).toBe(1)
    // Y más entradas piden más hueco: si no, se dibujarían encima de lo de al lado.
    expect(pieceLayout(and, 6).height).toBeGreaterThan(pieceLayout(and, 2).height)
  })

  it('el tri-estado conduce cuando le habilitan, y se queda mudo cuando no', () => {
    for (const id of ['triState1', 'triState2'] as const) {
      const piece = findPiece(id)

      // Habilitado: el dato (un 0) llega al LED, que se enciende en «cero» en vez de quedarse
      // apagado del todo. Quedarse en «off» sería no conducir.
      expect(ledState(wireUp(piece, 2, 'habilitado')), id).toBe('zero')

      // Sin habilitar, no emite: el LED se queda a oscuras de verdad.
      expect(ledState(wireUp(piece, 2, 'botones')), id).toBe('off')
    }
  })

  it('la sonda mira un cable y se registra para el osciloscopio', () => {
    const diagram = new Diagram()
    const button = diagram.addButton({ x: 0, y: 0 }, { isToggle: true })
    const probe = placePiece(diagram, findPiece('probe'), { x: 6, y: 0 }, 2)
    if (probe.kind === 'wire') {
      throw new Error('la paleta no coloca cables')
    }
    const output = placedPins(button).find((placed) => placed.pin.type === 'output')
    const input = placedPins(probe).find((placed) => placed.pin.type === 'input')
    if (output === undefined || input === undefined) {
      throw new Error('el circuito de la prueba no tiene los pines esperados')
    }
    diagram.addWire(output.point, input.point)

    const elements = diagram.elements
    const circuit: Circuit = { id: 'main', name: 'Main', elements }
    const project: Project = { id: 'p', name: 'P', mainCircuitId: 'main', circuits: [circuit] }
    const index = projectIndex(project)
    const runner = new CircuitRunner(index, index.circuit('main')!)
    const state = runner.turnOn()
    runner.step(false)

    expect(runner.hasProbes).toBe(true)
    const function_ = state.probes[0]
    expect(function_).toBeInstanceOf(FunctionProbe)
    expect((function_ as FunctionProbe).read(0)).toHaveLength(1)
  })

  it('la AND y la NAND son la misma compuerta con la salida negada', () => {
    const and = placePiece(new Diagram(), findPiece('and'), { x: 0, y: 0 }, 2)
    const nand = placePiece(new Diagram(), findPiece('nand'), { x: 0, y: 0 }, 2)

    expect(nand.kind === 'gate' && nand.gateType).toBe(and.kind === 'gate' && and.gateType)
    expect(and.kind === 'gate' && and.invertedOutput).toBe(false)
    expect(nand.kind === 'gate' && nand.invertedOutput).toBe(true)
  })

  it('el inversor nace negado, como en el original: no hay NOT sin negar', () => {
    // `CircuitDescriptorList.cs` crea la NOT con `Gate(GateType.Not, 1, true)` —el triángulo con
    // la bolita—, y el motor no sabe hacer la otra (`circuit-map.ts`). Si aquí se colara una NOT
    // sin negar, se colocaría una compuerta que no conduce nada.
    const not = findPiece('not')

    expect(not.kind === 'gate' && not.invertedOutput).toBe(true)
    expect(not.kind === 'gate' && not.inputCount).toBe(1)
  })

  it('el interruptor que se coloca es fijo: con el ratón no se pulsan dos a la vez', () => {
    const diagram = new Diagram()
    const button = placePiece(diagram, findPiece('button'), { x: 0, y: 0 }, 2)

    expect(button.kind).toBe('button')
    expect(button.kind === 'button' && button.isToggle).toBe(true)
  })

  it('colocar una pieza es una sola acción de deshacer', () => {
    const diagram = new Diagram()
    placePiece(diagram, findPiece('or'), { x: 0, y: 0 }, 3)

    expect(diagram.undo()).toBe(true)
    expect(diagram.count).toBe(0)
  })
})
