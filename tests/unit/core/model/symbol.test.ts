import { describe, expect, it } from 'vitest'
import {
  SymbolIndex,
  conductorMapOf,
  depictedId,
  isPrimitive,
  jamForPin,
  jamsByPinOrder,
  projectIndex,
  projectSymbolSource,
  symbolsOf,
} from '../../../../src/core/model/symbol'
import type {
  Button,
  Circuit,
  CircuitInstance,
  Constant,
  Gate,
  Memory,
  Pin,
  Project,
  StoredElement,
  Wire,
} from '../../../../src/core/model/types'

function gate(id: string, circuitId: string, gateType: Gate['gateType'] = 'and'): Gate {
  return {
    kind: 'gate',
    id,
    circuitId,
    layerId: 'principal',
    position: { x: 8, y: 2 },
    rotation: 'up',
    gateType,
    inputCount: 2,
    invertedOutput: false,
  }
}

function button(id: string, circuitId: string): Button {
  return {
    kind: 'button',
    id,
    circuitId,
    layerId: 'principal',
    position: { x: 2, y: 2 },
    rotation: 'up',
    isToggle: true,
    inverted: false,
  }
}

function sheetPin(
  id: string,
  circuitId: string,
  pinType: 'input' | 'output',
  position: { x: number; y: number },
  name: string,
): Pin {
  return {
    kind: 'pin',
    id,
    circuitId,
    layerId: 'principal',
    position,
    rotation: 'up',
    pinType,
    side: pinType === 'input' ? 'left' : 'right',
    bitWidth: 1,
    inverted: false,
    name,
  }
}

function wire(id: string, circuitId: string, x1: number, y1: number, x2: number, y2: number): Wire {
  return {
    kind: 'wire',
    id,
    circuitId,
    layerId: 'principal',
    p1: { x: x1, y: y1 },
    p2: { x: x2, y: y2 },
    bitWidth: 1,
  }
}

/**
 * El circuito `1a570a3c…` del fichero `CircuitMapTests.CircuitProject`, tal cual viene:
 * un pin de entrada colocado en (2, 2), uno de salida en (8, 2) y un cable entre sus
 * puntas. Es el caso que dejó claro dónde cae cada punta.
 */
function loopCircuit(): Circuit {
  return {
    id: 'lc',
    name: 'Loop',
    elements: [
      sheetPin('pin-x', 'lc', 'input', { x: 2, y: 2 }, 'x'),
      sheetPin('pin-q', 'lc', 'output', { x: 8, y: 2 }, 'q'),
      wire('w1', 'lc', 4, 3, 8, 3),
    ],
  }
}

function mainCircuit(...elements: readonly StoredElement[]): Circuit {
  return {
    id: 'main',
    name: 'Main',
    elements,
  }
}

function instance(id: string, circuitId: string, targetCircuitId: string): CircuitInstance {
  return {
    kind: 'circuit',
    id,
    circuitId,
    layerId: 'principal',
    position: { x: 8, y: 6 },
    rotation: 'up',
    targetCircuitId,
  }
}

describe('índice de símbolos (portado de CircuitGlyph.Jams)', () => {
  it('los símbolos se fabrican una sola vez: las puntas se comparan por objeto', () => {
    // `Splitter.Pass` compara puntas con `==`. Si cada llamada devolviera objetos nuevos,
    // esas comparaciones fallarían en silencio, así que la identidad es parte del contrato.
    const index = projectIndex({
      id: 'p',
      name: 'P',
      mainCircuitId: 'main',
      circuits: [mainCircuit(instance('i1', 'main', 'lc')), loopCircuit()],
    })

    const first = index.symbol(instance('i1', 'main', 'lc'))
    const second = index.symbol(instance('i1', 'main', 'lc'))

    expect(first).toBe(second)
    expect(first.jams[0]).toBe(second.jams[0])
  })

  it('una compuerta AND coloca sus puntas donde dice la rejilla', () => {
    const element = gate('g1', 'main')
    const index = new SymbolIndex(projectSymbolSource(smallProject(element)))
    index.addCircuit(mainCircuit(gate('g1', 'main')))

    const symbol = index.symbol(element)

    expect(symbol.depicted.kind).toBe('gate')
    expect(isPrimitive(symbol.depicted)).toBe(true)
    expect(symbol.jams.map((jam) => text(jam))).toEqual(['input@8,3', 'input@8,5', 'output@11,4'])
  })

  it('el interruptor tiene una sola punta, de salida y no negada', () => {
    const element = button('b1', 'main')
    const index = new SymbolIndex(projectSymbolSource(smallProject(element)))
    index.addCircuit(mainCircuit(element))

    const symbol = index.symbol(element)

    expect(symbol.jams.map((jam) => text(jam))).toEqual(['output@4,3'])
    expect(symbol.jams[0]?.inverted).toBe(false)
  })

  it('el interruptor negado saca su punta negada (original: CircuitButton.Inverted)', () => {
    const element: Button = { ...button('b1', 'main'), inverted: true }
    const index = new SymbolIndex(projectSymbolSource(smallProject(element)))
    index.addCircuit(mainCircuit(element))

    expect(index.symbol(element).jams[0]?.inverted).toBe(true)
  })

  it('las puntas se pueden pedir en el orden en que se crearon los pines', () => {
    // `Jams()` las da por lados, pero hay código que necesita el orden de creación: el
    // tri-estado lee la 0 como dato y la 1 como habilitación, y `Splitter.Pass` da por
    // hecho que la punta ancha se creó la primera. Con el tri-estado los dos órdenes no
    // coinciden, y ahí importa.
    const element: Gate = { ...gate('g1', 'main', 'triState1'), inputCount: 2 }
    const index = new SymbolIndex(projectSymbolSource(smallProject(element)))
    index.addCircuit(mainCircuit(element))
    const symbol = index.symbol(element)

    expect(symbol.jams.map((jam) => jam.pin.type)).toEqual(['input', 'output', 'input'])
    expect(jamsByPinOrder(symbol).map((jam) => jam.pin.type)).toEqual(['input', 'input', 'output'])
  })

  it('una punta de un pin de hoja no es ni entrada ni salida: es un pasamanos', () => {
    // Desde fuera de un subcircuito no se sabe —ni hace falta— si el pin de dentro es
    // entrada o salida. El original le pone PinType.None al DevicePin del pin justo por eso.
    const index = projectIndex(smallProject())
    index.addCircuit(loopCircuit())
    const symbol = index.symbol(sheetPin('pin-x', 'lc', 'input', { x: 2, y: 2 }, 'x'))

    expect(symbol.depicted.kind).toBe('pin')
    expect(isPrimitive(symbol.depicted)).toBe(false)
    expect(symbol.jams.map((jam) => text(jam))).toEqual(['none@4,3'])
  })
})

describe('las puntas de un subcircuito (portado de CircuitGlyph.CreateJam)', () => {
  function indexOfLoop(): SymbolIndex {
    const index = new SymbolIndex(
      projectSymbolSource({
        id: 'p',
        name: 'P',
        mainCircuitId: 'main',
        circuits: [mainCircuit(instance('i1', 'main', 'lc')), loopCircuit()],
      }),
    )
    index.addCircuit(mainCircuit(instance('i1', 'main', 'lc')))
    index.addCircuit(loopCircuit())
    return index
  }

  it('la caja mide lo que dice el original y los pines caen en el borde', () => {
    const symbol = indexOfLoop().symbol(instance('i1', 'main', 'lc'))

    // Un subcircuito con un pin por lado: ancho max(3, 1) = 3, alto max(4, 2) = 4.
    expect([symbol.layout.width, symbol.layout.height]).toEqual([3, 4])
    expect(symbol.jams.map((jam) => text(jam))).toEqual(['none@8,8', 'none@11,8'])
  })

  it('cada punta de fuera lleva dentro la punta del pin (original: Jam.InnerJam)', () => {
    const index = indexOfLoopWithPins()
    const symbol = index.symbol(instance('i1', 'main', 'lc'))

    // Fuera: (8+0, 6+2) = (8, 8) para la entrada y (8+3, 6+2) = (11, 8) para la salida.
    // Dentro: el pin de entrada está en (2, 2) y su punta en (4, 3); el de salida en (8, 2)
    // con la punta en (8, 3). Es el salto que hace funcionar un subcircuito sin saber quién
    // lo llama: atravesar el pin es saltar de una punta a la otra.
    const input = symbol.jams[0]
    const output = symbol.jams[1]

    expect(input?.sheetPin?.id).toBe('pin-x')
    expect(input?.innerJam?.point).toEqual({ x: 4, y: 3 })
    expect(output?.sheetPin?.id).toBe('pin-q')
    expect(output?.innerJam?.point).toEqual({ x: 8, y: 3 })
  })

  it('se encuentra la punta de fuera a partir del pin de hoja', () => {
    const index = indexOfLoopWithPins()
    const symbol = index.symbol(instance('i1', 'main', 'lc'))
    const pin = sheetPin('pin-q', 'lc', 'output', { x: 8, y: 2 }, 'q')

    const jam = jamForPin(symbol, pin)

    expect(jam?.point).toEqual({ x: 11, y: 8 })
    expect(jamForPin(symbol, sheetPin('pin-z', 'lc', 'input', { x: 0, y: 0 }, 'z'))).toBeNull()
  })

  it('el nombre del pin viaja a la punta de fuera', () => {
    const symbol = indexOfLoopWithPins().symbol(instance('i1', 'main', 'lc'))

    expect(symbol.jams.map((jam) => jam.pin.name)).toEqual(['x', 'q'])
  })

  it('un circuito es primitivo solo si sabe simularse: un subcircuito no', () => {
    const symbol = indexOfLoop().symbol(instance('i1', 'main', 'lc'))

    expect(isPrimitive(symbol.depicted)).toBe(false)
    expect(depictedId(symbol.depicted)).toBe('lc')
  })

  function indexOfLoopWithPins(): SymbolIndex {
    const index = new SymbolIndex(
      projectSymbolSource({
        id: 'p',
        name: 'P',
        mainCircuitId: 'main',
        circuits: [mainCircuit(instance('i1', 'main', 'lc')), loopCircuit()],
      }),
    )
    for (const circuit of [mainCircuit(instance('i1', 'main', 'lc')), loopCircuit()]) {
      index.addCircuit(circuit)
    }
    return index
  }
})

describe('símbolos primitivos', () => {
  it('la constante tiene una salida del ancho de su valor', () => {
    const constant: Constant = {
      kind: 'constant',
      id: 'k1',
      circuitId: 'main',
      layerId: 'principal',
      position: { x: 0, y: 0 },
      rotation: 'up',
      value: 5,
      bitWidth: 4,
      pinSide: 'right',
    }
    const index = new SymbolIndex(projectSymbolSource(smallProject(constant)))
    index.addCircuit(mainCircuit(constant))

    const symbol = index.symbol(constant)
    expect(symbol.jams).toHaveLength(1)
    expect(symbol.jams[0]!.pin.type).toBe('output')
    expect(symbol.jams[0]!.bitWidth).toBe(4)
  })
})

describe('lo que todavía no está portado', () => {
  it('la forma de un dispositivo sin portar avisa en vez de inventarse un tamaño', () => {
    const memory: Memory = {
      kind: 'memory',
      id: 'm1',
      circuitId: 'main',
      layerId: 'principal',
      position: { x: 0, y: 0 },
      rotation: 'up',
      addressBitWidth: 4,
      dataBitWidth: 8,
      isRom: true,
    }
    const index = new SymbolIndex(projectSymbolSource(smallProject(memory)))
    index.addCircuit(mainCircuit(memory))

    expect(() => index.symbol(memory)).toThrow(/no está portada/)
  })
})

describe('atajos del documento', () => {
  it('separa los símbolos de los cables de una hoja', () => {
    const index = projectIndex({
      id: 'p',
      name: 'P',
      mainCircuitId: 'lc',
      circuits: [loopCircuit()],
    })

    expect(symbolsOf(index, 'lc').map((symbol) => symbol.id)).toEqual(['pin-x', 'pin-q'])
    expect(conductorMapOf(index, 'lc').conductors.length).toBeGreaterThan(0)
  })
})

function text(jam: { effectivePinType: string; point: { x: number; y: number } }): string {
  return `${jam.effectivePinType}@${jam.point.x},${jam.point.y}`
}

/** Un proyecto mínimo con un solo elemento en la hoja principal. */
function smallProject(...elements: readonly StoredElement[]): Project {
  return {
    id: 'p',
    name: 'P',
    mainCircuitId: 'main',
    circuits: [{ id: 'main', name: 'Main', elements }],
  }
}
