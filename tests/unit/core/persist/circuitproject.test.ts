/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import fixtureXml from '../../../../tests/fixtures/CircuitMapTests.CircuitProject?raw'
import { importCircuitProject, exportCircuitProject } from '../../../../src/core/persist/circuitproject'

describe('circuitproject (M4-07/08)', () => {
  it('importa un fixture sin reventar', () => {
    const project = importCircuitProject(fixtureXml)
    expect(project.count).toBeGreaterThan(0)
    expect(project.circuitsList.length).toBeGreaterThan(0)
  })

  it('exporta XML no vacío', () => {
    const project = importCircuitProject(fixtureXml)
    const out = exportCircuitProject(project)
    expect(out).toContain('<lc:CircuitProject')
    expect(out).toContain('</lc:CircuitProject>')
  })
})