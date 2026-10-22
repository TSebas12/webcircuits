/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { importCircuitProject } from '../../../../src/core/persist/circuitproject'
import { projectIndex, symbolsOf } from '../../../../src/core/model/symbol'
import { CircuitMap } from '../../../../src/core/simulate/circuit-map'
import { HISTORY_SIZE } from '../../../../src/core/simulate/circuit-runner'
import { FunctionProbe } from '../../../../src/core/function/probes'
import { State } from '../../../../src/core/function/state'
import type { CircuitProject } from '../../../../src/core/model/circuit'
import type { Circuit } from '../../../../src/core/model/types'

import circuitMapXml from '../../../fixtures/CircuitMapTests.CircuitProject?raw'
import circuitMapCleanupXml from '../../../fixtures/CircuitMapCleanUpTest.CircuitProject?raw'
import circuitTestSocketXml from '../../../fixtures/CircuitTestSocketTest.CircuitProject?raw'
import digitalClockXml from '../../../fixtures/Digital Clock.CircuitProject?raw'
import functionTestXml from '../../../fixtures/FunctionTest.CircuitProject?raw'
import integerCalculatorXml from '../../../fixtures/IntegerCalculator.CircuitProject?raw'
import externalCalculatorXml from '../../../fixtures/ExternalCalculator.CircuitProject?raw'
import splitterConversionXml from '../../../fixtures/Splitter Conversion.CircuitProject?raw'

const fixtures: ReadonlyArray<{
  readonly name: string
  readonly xml: string
  readonly canSimulate: boolean
}> = [
  { name: 'CircuitMapTests.CircuitProject', xml: circuitMapXml, canSimulate: true },
  { name: 'CircuitMapCleanUpTest.CircuitProject', xml: circuitMapCleanupXml, canSimulate: true },
  { name: 'CircuitTestSocketTest.CircuitProject', xml: circuitTestSocketXml, canSimulate: true },
  { name: 'Digital Clock.CircuitProject', xml: digitalClockXml, canSimulate: false },
  { name: 'FunctionTest.CircuitProject', xml: functionTestXml, canSimulate: true },
  { name: 'IntegerCalculator.CircuitProject', xml: integerCalculatorXml, canSimulate: false },
  { name: 'ExternalCalculator.CircuitProject', xml: externalCalculatorXml, canSimulate: false },
  { name: 'Splitter Conversion.CircuitProject', xml: splitterConversionXml, canSimulate: false },
]

/** Los fixtures se importan una sola vez por archivo: los grandes tardan segundos. */
const importedProjects = new Map<string, CircuitProject>()
const projectIndexes = new Map<string, ReturnType<typeof projectIndex>>()

function importedProject(xml: string): CircuitProject {
  let project = importedProjects.get(xml)
  if (project === undefined) {
    project = importCircuitProject(xml)
    importedProjects.set(xml, project)
  }
  return project
}

/** El proyecto importado, con el índice que necesita `CircuitMap`. */
function loadProject(xml: string): {
  project: CircuitProject
  index: ReturnType<typeof projectIndex>
} {
  const project = importedProject(xml)
  let index = projectIndexes.get(xml)
  if (index === undefined) {
    index = projectIndex({
      id: project.name,
      name: project.name,
      circuits: project.circuitsList,
      mainCircuitId: project.currentCircuitId,
    })
    projectIndexes.set(xml, index)
  }
  return { project, index }
}

/** Un circuito por nombre; el original cambia de hoja con `ProjectTester.SwitchTo`. */
function circuitNamed(project: CircuitProject, name: string): Circuit {
  const circuit = project.circuitsList.find((candidate) => candidate.name === name)
  if (circuit === undefined) {
    throw new Error(`El fixture no tiene el circuito «${name}».`)
  }
  return circuit
}

describe('fixtures con jerarquía (M3-15)', () => {
  for (const fixture of fixtures) {
    // Los fixtures grandes (ExternalCalculator) tardan varios segundos en un portátil
    // cargado. No es una prueba de rendimiento: el criterio es que importe y resuelva, así
    // que se le da margen para que no falle por la máquina que toque.
    it(`${fixture.name} importa y resuelve sus subcircuitos`, () => {
      const project = importedProject(fixture.xml)
      expect(project.circuitsList.length).toBeGreaterThan(1)

      for (const circuit of project.circuitsList) {
        for (const element of circuit.elements) {
          if (element.kind === 'circuit') {
            expect(project.circuit(element.targetCircuitId)).toBeDefined()
          }
        }
      }
    }, 20_000)
  }

  for (const fixture of fixtures.filter((fixture) => fixture.canSimulate)) {
    it(`${fixture.name} se aplana y simula sin reventar`, () => {
      const { project, index } = loadProject(fixture.xml)
      const map = CircuitMap.create(index, project.current)
      expect(() => map.apply(0)).not.toThrow()
    })
  }
})

/**
 * Los casos de `CircuitMapTest.cs`.
 *
 * El original tiene cuatro métodos: dos de limpieza/lazo y dos de rendimiento. Los dos
 * primeros se portan tal cual. Los de rendimiento se quedan en una prueba de humo —crear,
 * aplanar y encender— porque su umbral de segundos depende de la máquina y ya se midió que
 * falla bajo carga; el rendimiento formal es M12 (ver `docs/BASELINE-TESTS.md`).
 */
describe('CircuitMap · casos del original (M2-07)', () => {
  it('la limpieza descarta lo que no llega a ninguna parte', () => {
    const { project, index } = loadProject(circuitMapCleanupXml)
    const cases: ReadonlyArray<{
      readonly name: string
      readonly functions: number
      readonly symbols: number
    }> = [
      { name: '1. Empty 1', functions: 0, symbols: 0 },
      { name: '2. Empty 2', functions: 0, symbols: 7 },
      { name: '3. Single Out', functions: 3, symbols: 4 },
      { name: '4. Chain Out', functions: 8, symbols: 11 },
    ]

    for (const testCase of cases) {
      const circuit = circuitNamed(project, testCase.name)
      const state = CircuitMap.create(index, circuit).apply(HISTORY_SIZE)
      expect(state.functions).toHaveLength(testCase.functions)
      expect(symbolsOf(index, circuit.id)).toHaveLength(testCase.symbols)
    }
  })

  it('un lazo de cables profundo lleva la señal de la constante a la probeta', () => {
    const { project, index } = loadProject(circuitMapXml)
    const circuit = circuitNamed(project, 'DeepWireLoopTest')
    const map = CircuitMap.create(index, circuit)
    const state = map.apply(HISTORY_SIZE)
    map.turnOn()

    const constant = circuit.elements.find((element) => element.kind === 'constant')
    if (constant === undefined) {
      throw new Error('El fixture no tiene la constante de entrada.')
    }
    const input = map.functionConstant(index.symbol(constant))
    if (input === null) {
      throw new Error('La constante no llegó a tener función.')
    }
    const probe = state.functions.find((function_) => function_ instanceof FunctionProbe)
    if (probe === undefined) {
      throw new Error('El fixture no tiene la probeta de salida.')
    }

    // El original alterna 0/1 diez veces dentro de una transacción. La transacción solo
    // agrupa el historial de deshacer; aquí lo que importa es que el lazo se reevalúe.
    for (let i = 0; i < 10; i += 1) {
      const value = i & 1
      input.value = value
      expect(state.evaluate(true)).toBe(true)
      expect(probe.get(0)).toBe(value === 1 ? State.On1 : State.On0)
    }
  })

  it('los proyectos grandes se crean, aplanan y encienden sin reventar', () => {
    const cases: ReadonlyArray<{
      readonly xml: string
      readonly name: string
      readonly circuit: string
    }> = [
      { xml: integerCalculatorXml, name: 'IntegerCalculator', circuit: 'Test Computer' },
      { xml: externalCalculatorXml, name: 'ExternalCalculator', circuit: 'Main' },
    ]

    for (const testCase of cases) {
      const { project, index } = loadProject(testCase.xml)
      const circuit = circuitNamed(project, testCase.circuit)
      const map = CircuitMap.create(index, circuit)
      expect(() => map.apply(HISTORY_SIZE), testCase.name).not.toThrow()
      expect(() => map.turnOn(), testCase.name).not.toThrow()
    }
  }, 60_000)
})
