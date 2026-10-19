/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import fixtureXml from '../../../../tests/fixtures/CircuitMapTests.CircuitProject?raw'
import { importCircuitProject, exportCircuitProject } from '../../../../src/core/persist/circuitproject'

describe('roundtrip .CircuitProject', () => {
  it('import -> export -> import conserva el numero de circuitos', () => {
    const p1 = importCircuitProject(fixtureXml)
    const xml = exportCircuitProject(p1)
    const p2 = importCircuitProject(xml)
    expect(p2.circuitsList.length).toBe(p1.circuitsList.length)
  })
})