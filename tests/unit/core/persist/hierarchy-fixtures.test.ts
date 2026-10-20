/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { importCircuitProject } from '../../../../src/core/persist/circuitproject'
import { projectIndex } from '../../../../src/core/model/symbol'
import { CircuitMap } from '../../../../src/core/simulate/circuit-map'

import circuitMapXml from '../../../fixtures/CircuitMapTests.CircuitProject?raw'
import circuitMapCleanupXml from '../../../fixtures/CircuitMapCleanUpTest.CircuitProject?raw'
import circuitTestSocketXml from '../../../fixtures/CircuitTestSocketTest.CircuitProject?raw'
import digitalClockXml from '../../../fixtures/Digital Clock.CircuitProject?raw'
import functionTestXml from '../../../fixtures/FunctionTest.CircuitProject?raw'
import integerCalculatorXml from '../../../fixtures/IntegerCalculator.CircuitProject?raw'
import externalCalculatorXml from '../../../fixtures/ExternalCalculator.CircuitProject?raw'
import splitterConversionXml from '../../../fixtures/Splitter Conversion.CircuitProject?raw'

const fixtures: ReadonlyArray<{ readonly name: string; readonly xml: string; readonly canSimulate: boolean }> = [
  { name: 'CircuitMapTests.CircuitProject', xml: circuitMapXml, canSimulate: true },
  { name: 'CircuitMapCleanUpTest.CircuitProject', xml: circuitMapCleanupXml, canSimulate: true },
  { name: 'CircuitTestSocketTest.CircuitProject', xml: circuitTestSocketXml, canSimulate: true },
  { name: 'Digital Clock.CircuitProject', xml: digitalClockXml, canSimulate: false },
  { name: 'FunctionTest.CircuitProject', xml: functionTestXml, canSimulate: true },
  { name: 'IntegerCalculator.CircuitProject', xml: integerCalculatorXml, canSimulate: false },
  { name: 'ExternalCalculator.CircuitProject', xml: externalCalculatorXml, canSimulate: false },
  { name: 'Splitter Conversion.CircuitProject', xml: splitterConversionXml, canSimulate: false },
]

describe('fixtures con jerarquía (M3-15)', () => {
  for (const fixture of fixtures) {
    // Los fixtures grandes (ExternalCalculator) tardan varios segundos en un portátil
    // cargado. No es una prueba de rendimiento: el criterio es que importe y resuelva, así
    // que se le da margen para que no falle por la máquina que toque.
    it(`${fixture.name} importa y resuelve sus subcircuitos`, () => {
      const project = importCircuitProject(fixture.xml)
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
      const project = importCircuitProject(fixture.xml)
      const index = projectIndex({
        id: project.name,
        name: project.name,
        circuits: project.circuitsList,
        mainCircuitId: project.currentCircuitId,
      })
      const map = CircuitMap.create(index, project.current)
      expect(() => map.apply(0)).not.toThrow()
    })
  }
})