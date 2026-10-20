import { describe, expect, it } from 'vitest'
import { CircuitError } from '../../../../src/core/circuit-error'
import { CircuitProject } from '../../../../src/core/model/circuit'
import { projectIndex } from '../../../../src/core/model/symbol'
import { deserializeProject, serializeProject } from '../../../../src/core/persist/json'
import type {
  CircuitInstance,
  Gate,
  Pin,
  StoredElement,
  Wire,
} from '../../../../src/core/model/types'
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

  it('evalúa filtros aritméticos sobre las columnas', () => {
    const project = andProject()
    const table = generateTruthTable(project, project.current, { filter: 'A + B == 2' })

    expect(table.rows.map((row) => [...row.input, ...row.output])).toEqual([[1, 1, 1]])
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

  it('enumera buses de varios bits y conserva el peso de cada bit', () => {
    const project = new CircuitProject('bus')
    const elements: StoredElement[] = [
      pin('a', 'input', -4, 0, 'A', 2),
      pin('q', 'output', 5, 0, 'Q', 2),
      wire('w', -2, 1, 5, 1, 2),
    ]
    for (const element of elements) {
      project.current.diagram.importElement(element)
    }

    const table = generateTruthTable(project, project.current)

    expect(table.totalRows).toBe(4)
    expect(table.rows.map((row) => [...row.input, ...row.output])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ])
  })

  it('atraviesa un subcircuito y tabula su inversor', () => {
    const project = new CircuitProject('jerarquia')
    const child = project.createCircuit({ name: 'INV' })
    const childElements: StoredElement[] = [
      { ...pin('in', 'input', -4, 0, 'IN'), circuitId: child.id },
      { ...gate('g', 'not', 0, 0, 1), invertedOutput: true, circuitId: child.id },
      { ...pin('out', 'output', 5, 0, 'OUT'), circuitId: child.id },
      { ...wire('wi', -2, 1, 0, 2), circuitId: child.id },
      { ...wire('wo', 3, 2, 5, 1), circuitId: child.id },
    ]
    for (const element of childElements) {
      child.diagram.importElement(element)
    }

    const instance: CircuitInstance = {
      kind: 'circuit',
      id: 'u',
      circuitId: 'main',
      layerId: 'principal',
      position: { x: 0, y: 0 },
      rotation: 'up',
      targetCircuitId: child.id,
    }
    for (const element of [
      pin('a', 'input', -10, 0, 'A'),
      instance,
      pin('q', 'output', 10, 0, 'Q'),
    ] satisfies StoredElement[]) {
      project.current.diagram.importElement(element)
    }

    const index = projectIndex({
      id: project.name,
      name: project.name,
      circuits: project.circuitsList,
      mainCircuitId: project.currentCircuitId,
    })
    const symbol = index.symbol(instance)
    const inputJam = symbol.jams.find((jam) => jam.sheetPin?.name === 'IN')
    const outputJam = symbol.jams.find((jam) => jam.sheetPin?.name === 'OUT')
    expect(inputJam).toBeDefined()
    expect(outputJam).toBeDefined()
    project.current.diagram.importElement(
      wire('wa', -8, 1, inputJam!.point.x, inputJam!.point.y),
    )
    project.current.diagram.importElement(
      wire('wq', outputJam!.point.x, outputJam!.point.y, 10, 1),
    )

    const table = generateTruthTable(project, project.current)
    expect(table.rows.map((row) => [...row.input, ...row.output])).toEqual([
      [0, 1],
      [1, 0],
    ])
  })

  it('atraviesa dos niveles de subcircuitos', () => {
    const project = new CircuitProject('jerarquia-doble')
    const inverter = project.createCircuit({ name: 'INV' })
    const invElements: StoredElement[] = [
      { ...pin('in', 'input', -4, 0, 'IN'), circuitId: inverter.id },
      { ...gate('g', 'not', 0, 0, 1), invertedOutput: true, circuitId: inverter.id },
      { ...pin('out', 'output', 5, 0, 'OUT'), circuitId: inverter.id },
      { ...wire('wi', -2, 1, 0, 2), circuitId: inverter.id },
      { ...wire('wo', 3, 2, 5, 1), circuitId: inverter.id },
    ]
    for (const element of invElements) {
      inverter.diagram.importElement(element)
    }

    const middle = project.createCircuit({ name: 'MID' })
    const inner: CircuitInstance = {
      kind: 'circuit',
      id: 'inner',
      circuitId: middle.id,
      layerId: 'principal',
      position: { x: 0, y: 0 },
      rotation: 'up',
      targetCircuitId: inverter.id,
    }
    for (const element of [
      { ...pin('min', 'input', -10, 0, 'IN'), circuitId: middle.id },
      inner,
      { ...pin('mout', 'output', 10, 0, 'OUT'), circuitId: middle.id },
    ] satisfies StoredElement[]) {
      middle.diagram.importElement(element)
    }

    const outer: CircuitInstance = {
      kind: 'circuit',
      id: 'outer',
      circuitId: 'main',
      layerId: 'principal',
      position: { x: 0, y: 0 },
      rotation: 'up',
      targetCircuitId: middle.id,
    }
    for (const element of [
      pin('a', 'input', -10, 0, 'A'),
      outer,
      pin('q', 'output', 10, 0, 'Q'),
    ] satisfies StoredElement[]) {
      project.current.diagram.importElement(element)
    }

    const index = projectIndex({
      id: project.name,
      name: project.name,
      circuits: project.circuitsList,
      mainCircuitId: project.currentCircuitId,
    })

    function connect(
      instance: CircuitInstance,
      circuitId: string,
      inputPinName: string,
      outputPinName: string,
      inputPoint: { x: number; y: number },
      outputPoint: { x: number; y: number },
      prefix: string,
    ): void {
      const symbol = index.symbol(instance)
      const inputJam = symbol.jams.find((jam) => jam.sheetPin?.name === inputPinName)
      const outputJam = symbol.jams.find((jam) => jam.sheetPin?.name === outputPinName)
      expect(inputJam).toBeDefined()
      expect(outputJam).toBeDefined()
      const diagram =
        circuitId === 'main' ? project.current.diagram : project.circuitsList.find((c) => c.id === circuitId)!.diagram
      diagram.importElement({ ...wire(`${prefix}i`, inputPoint.x, inputPoint.y, inputJam!.point.x, inputJam!.point.y), circuitId })
      diagram.importElement({ ...wire(`${prefix}o`, outputJam!.point.x, outputJam!.point.y, outputPoint.x, outputPoint.y), circuitId })
    }

    // La instancia de INV vive en MID; la de MID, en la hoja principal. La punta interior
    // de un pin de salida cae en el borde izquierdo de su caja, en su misma X.
    connect(inner, middle.id, 'IN', 'OUT', { x: -8, y: 1 }, { x: 10, y: 1 }, 'm')
    connect(outer, 'main', 'IN', 'OUT', { x: -8, y: 1 }, { x: 10, y: 1 }, 'w')

    const table = generateTruthTable(project, project.current)
    expect(table.rows.map((row) => [...row.input, ...row.output])).toEqual([
      [0, 1],
      [1, 0],
    ])
  })

  it('avisa si el circuito oscila en vez de devolver filas falsas', () => {
    const project = new CircuitProject('oscila')
    const elements: StoredElement[] = [
      pin('a', 'input', -10, 0, 'A'),
      { ...gate('g', 'not', 0, 0, 1), invertedOutput: true },
      pin('q', 'output', 10, 0, 'Q'),
      wire('wa', -8, 1, 0, 2),
      wire('loop', 3, 2, 0, 2),
      wire('wq', 3, 2, 10, 1),
    ]
    for (const element of elements) {
      project.current.diagram.importElement(element)
    }

    expect(() => generateTruthTable(project, project.current)).toThrow(CircuitError)
  })

  it('funciona sobre el proyecto serializado que recibe el worker', () => {
    const project = andProject()
    const copy = deserializeProject(serializeProject(project))
    const table = generateTruthTable(copy, copy.current)

    expect(table.rows.map((row) => [...row.input, ...row.output])).toEqual([
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 1],
    ])
  })

  it('exporta la tabla a CSV con cabecera', () => {
    const project = andProject()
    const table = generateTruthTable(project, project.current)
    const csv = truthTableToCsv(table)

    expect(csv.split('\r\n')[0]).toBe('A,B,Q')
    expect(csv.split('\r\n')).toHaveLength(5)
  })
})
