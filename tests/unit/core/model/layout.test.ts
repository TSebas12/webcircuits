import { describe, expect, it } from 'vitest'
import {
  MAX_GATE_INPUTS,
  buttonLayout,
  deviceBounds,
  gateLayout,
  pinPosition,
  placedPins,
  rotatePoint,
  rotationAngle,
  rotationCenter,
} from '../../../../src/core/model/layout'
import type { Button, Gate, GateType, GridPoint, Rotation } from '../../../../src/core/model/types'

function gate(gateType: GateType, position: GridPoint, inputCount = 2): Gate {
  return {
    kind: 'gate',
    id: 'g1',
    circuitId: 'main',
    layerId: 'principal',
    position,
    rotation: 'up',
    gateType,
    inputCount,
    invertedOutput: false,
  }
}

function button(position: GridPoint): Button {
  return {
    kind: 'button',
    id: 'b1',
    circuitId: 'main',
    layerId: 'principal',
    position,
    rotation: 'up',
    isToggle: true,
    inverted: false,
  }
}

/** Los pines como texto, para leer las comprobaciones de un vistazo. */
function pinText(type: GateType, inputCount: number): string[] {
  return gateLayout(type, inputCount).pins.map((pin) => `${pin.type}@${pin.point.x},${pin.point.y}`)
}

describe('medidas de los símbolos (portado de Circuit.Update/UpdatePin)', () => {
  it('una AND de 2 entradas mide 3×4 y tiene los pines donde dice el original', () => {
    const layout = gateLayout('and', 2)

    expect([layout.width, layout.height]).toEqual([3, 4])
    // Entradas: d = (4-2)/(2-1) = 2 → y = 1 y 3. Salida: altura/2 = 2.
    expect(pinText('and', 2)).toEqual(['input@0,1', 'input@0,3', 'output@3,2'])
  })

  it('una AND de 3 entradas cabe en el alto mínimo y reparte los pines de uno en uno', () => {
    expect(gateLayout('and', 3).height).toBe(4)
    expect(pinText('and', 3)).toEqual(['input@0,1', 'input@0,2', 'input@0,3', 'output@3,2'])
  })

  it('a partir de 4 entradas el símbolo crece y los pines siguen separados una celda', () => {
    expect(gateLayout('and', 4).height).toBe(5)
    expect(pinText('and', 4)).toEqual([
      'input@0,1',
      'input@0,2',
      'input@0,3',
      'input@0,4',
      'output@3,2',
    ])
  })

  it('con el máximo de entradas (18) el símbolo mide 3×19 y no se sale de la rejilla', () => {
    const layout = gateLayout('and', MAX_GATE_INPUTS)

    expect(MAX_GATE_INPUTS).toBe(18) // el original: Gate.MaxInputCount
    expect([layout.width, layout.height]).toEqual([3, 19])

    const inputs = layout.pins.filter((pin) => pin.type === 'input')
    expect(inputs.map((pin) => pin.point.y)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ])
  })

  it('el LED mide 2×2 con una sola entrada a la izquierda y sin salida', () => {
    const layout = gateLayout('led', 1)

    expect([layout.width, layout.height]).toEqual([2, 2])
    expect(pinText('led', 1)).toEqual(['input@0,1'])
  })

  it('el interruptor mide 2×2 con una sola salida a la derecha', () => {
    const layout = buttonLayout()

    expect([layout.width, layout.height]).toEqual([2, 2])
    expect(layout.pins.map((pin) => `${pin.type}@${pin.point.x},${pin.point.y}`)).toEqual([
      'output@2,1',
    ])
  })

  it('la compuerta NOT mide 3×4 con la entrada y la salida centradas', () => {
    expect(pinText('not', 1)).toEqual(['input@0,2', 'output@3,2'])
  })
})

describe('posición de los pines', () => {
  it('sin girar, la posición del pin es la del símbolo más la local', () => {
    const layout = gateLayout('and', 2)
    const output = layout.pins[2]
    expect(output).toBeDefined()
    if (output === undefined) {
      return
    }

    expect(pinPosition({ x: 8, y: 2 }, 'up', layout, output)).toEqual({ x: 11, y: 4 })
  })

  it('al girar 90° los pines se mueven con el símbolo', () => {
    const layout = gateLayout('and', 2)
    const output = layout.pins[2]
    expect(output).toBeDefined()
    if (output === undefined) {
      return
    }

    // El centro de un 3×4 cae en (1, 2) — abajo se explica por qué no es (1,5, 2).
    expect(pinPosition({ x: 0, y: 0 }, 'right', layout, output)).toEqual({ x: 1, y: 4 })
  })
})

describe('rotación (portado de Symbol.RotationCenter y Symbol.Angle)', () => {
  it('los ángulos son los del original: arriba 0, derecha 90, abajo 180, izquierda -90', () => {
    const angles: Readonly<Record<Rotation, number>> = {
      up: rotationAngle('up'),
      right: rotationAngle('right'),
      down: rotationAngle('down'),
      left: rotationAngle('left'),
    }

    expect(angles).toEqual({ up: 0, right: 90, down: 180, left: -90 })
  })

  it('con la misma paridad el centro es el geométrico', () => {
    // 3×5: los dos impares.
    expect(rotationCenter(3, 5)).toEqual({ x: 1.5, y: 2.5 })
    // 4×2: los dos pares.
    expect(rotationCenter(4, 2)).toEqual({ x: 2, y: 1 })
  })

  it('con paridad distinta el original baja el centro a la rejilla, y deja de ser el centro', () => {
    // 3×4 → división ENTERA: 3/2 = 1 y 4/2 = 2. No es (1,5, 2): es (1, 2).
    // Es raro, pero cambiarlo movería los pines de todas las compuertas giradas.
    expect(rotationCenter(3, 4)).toEqual({ x: 1, y: 2 })
  })

  it('girar 90° es exacto: no aparecen pines en 2,9999999', () => {
    expect(rotatePoint({ x: 0, y: 1 }, 'right', 3, 4)).toEqual({ x: 2, y: 1 })
    expect(rotatePoint({ x: 0, y: 1 }, 'down', 3, 4)).toEqual({ x: 2, y: 3 })
    expect(rotatePoint({ x: 0, y: 1 }, 'left', 3, 4)).toEqual({ x: 0, y: 3 })
  })

  it('al girar, la caja del símbolo se da la vuelta y se sale a coordenadas negativas', () => {
    // Esto es justo el motivo por el que el editor tiene que recolocar el símbolo al
    // rotarlo: si no, se movería de sitio. La cuenta vive aquí, el recolocado en M2.
    expect(deviceBounds(gate('and', { x: 0, y: 0 }))).toEqual({ x0: 0, y0: 0, x1: 3, y1: 4 })
    expect(deviceBounds({ ...gate('and', { x: 0, y: 0 }), rotation: 'right' })).toEqual({
      x0: -1,
      y0: 1,
      x1: 3,
      y1: 4,
    })
  })
})

describe('pines de un dispositivo colocado', () => {
  it('devuelve la posición absoluta de cada pin', () => {
    const placed = placedPins(gate('and', { x: 8, y: 2 }))

    expect(placed.map((entry) => `${entry.pin.type}@${entry.point.x},${entry.point.y}`)).toEqual([
      'input@8,3',
      'input@8,5',
      'output@11,4',
    ])
  })

  it('el pin de salida del interruptor cae a la derecha de su caja', () => {
    const placed = placedPins(button({ x: 2, y: 2 }))

    expect(placed.map((entry) => `${entry.pin.type}@${entry.point.x},${entry.point.y}`)).toEqual([
      'output@4,3',
    ])
  })
})

describe('lo que todavía no está portado', () => {
  it('las compuertas que faltan avisan en vez de mentir con un tamaño inventado', () => {
    expect(() => gateLayout('clock', 0)).toThrow(/no está implementado/)
    expect(() => gateLayout('triState1', 1)).toThrow(/no está implementado/)
  })
})
