import { describe, expect, it } from 'vitest'
import { CircuitProject } from '../../../../src/core/model/circuit'
import type { Gate, Pin, StoredElement, Wire } from '../../../../src/core/model/types'
import { generateTruthTable, truthTableToCsv } from '../../../../src/core/truthtable/generate'

function pin(
  id: string,
  pinType: 'input' | 'output',
  x: number,
  y: number,
  name: string,
  bitWidth = 1,
): Pin {
  return {
    kind: 'pin',
    id,
    circuitId: 'main',
    layerId: 'principal',
    position: { x, y },
    rotation: 'up',
    pinType,
    side: pinType === 'input' ? 'left' : 'right',
    bitWidth,
    inverted: false,
    name,
  }
}

function gate(id: string, gateType: Gate['gateType'], x: number, y: number, inputCount = 2): Gate {
  return {
    kind: 'gate',
    id,
    circuitId: 'main',
    layerId: 'principal',
    position: { x, y },
    rotation: 'up',
    gateType,
    inputCount,
    invertedOutput: false,
  }
}

function wire(id: string, x1: number, y1: number, x2: number, y2: number, bitWidth = 1): Wire {
  return {
    kind: 'wire',
    id,
    circuitId: 'main',
    layerId: 'principal',
    p1: { x: x1, y: y1 },
    p2: { x: x2, y: y2 },
    bitWidth,
  }
}

/**
 * Una AND de dos entradas con dos pines de entrada y uno de salida.
 *
 * La compuerta mide 4×4 y está en (0, 0): entradas en (0,1) y (0,3), salida en (3,2). Los
 * pines de entrada se colocan a la izquierda con su punta interior en x = 0, y el de salida
 * a la derecha con la suya en (5,2).
 */
function andProject(): CircuitProject {
  const project = new CircuitProject('tabla')
  const elements: StoredElement[] = [
    pin('a', 'input', -4, 0, 'A'),
    pin('b', 'input', -4, 2, 'B'),
    gate('g', 'and', 0, 0),
    pin('q', 'output', 5, 1, 'Q'),
    wire('wa', -2, 1, 0, 1),
    wire('wb', -2, 3, 0, 3),
    wire('wq', 3, 2, 5, 2),
  ]
  for (const element of elements) {
    project.current.diagram.importElement(element)
  }
  return project
}

describe('generación de tablas de verdad (M8)', () => {
  it('enumera todas las combinaciones de una AND', () => {
    const project = andProject()
    const table = generateTruthTable(project, project.current)

    expect(table.inputs.map((input) => input.name)).toEqual(['A', 'B'])
    expect(table.outputs.map((output) => output.name)).toEqual(['Q'])
    expect(table.totalRows).toBe(4)
    expect(table.truncated).toBe(false)
    expect(table.rows.map((row) => [...row.input, ...row.output])).toEqual([
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 1],
    ])
  })

  it('aplica un filtro sobre las filas', () => {
    const project = andProject()
    const table = generateTruthTable(project, project.current, { filter: 'A && B' })

    expect(table.rows).toHaveLength(1)
    expect(table.rows[0]?.input).toEqual([1, 1])
    expect(table.rows[0]?.output).toEqual([1])
  })

  it('invierte el filtro', () => {
    const project = andProject()
    const table = generateTruthTable(project, project.current, {
      filter: 'A && B',
      invertFilter: true,
    })

    expect(table.rows).toHaveLength(3)
    expect(table.rows.every((row) => row.output[0] === 0)).toBe(true)
  })

  it('trunca al llegar al máximo de filas', () => {
    const project = andProject()
    const table = generateTruthTable(project, project.current, { maxRows: 2 })

    expect(table.rows).toHaveLength(2)
    expect(table.truncated).toBe(true)
  })

  it('exporta la tabla a CSV con cabecera', () => {
    const project = andProject()
    const table = generateTruthTable(project, project.current)
    const csv = truthTableToCsv(table)

    expect(csv.split('\r\n')[0]).toBe('A,B,Q')
    expect(csv.split('\r\n')).toHaveLength(5)
  })
})
