// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { importCircuitProject, exportCircuitProject } from '../../../src/core/persist/circuitproject'

const fixtures = import.meta.glob('../../../tests/fixtures/*.CircuitProject', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('M4-11 ida y vuelta con fixtures', () => {
  const entries = Object.entries(fixtures)
  it('hay fixtures que probar', () => {
    expect(entries.length).toBeGreaterThan(0)
  })
  for (const [path, xml] of entries) {
    const name = path.split('/').pop()!
    it(`round-trip: ${name}`, { timeout: 120000 }, () => {
      const project = importCircuitProject(xml)
      const out = exportCircuitProject(project)
      const project2 = importCircuitProject(out)
      expect(project2.circuitsList.length).toBe(project.circuitsList.length)
      const elements1 = project.circuitsList.reduce((a, c) => a + c.elements.length, 0)
      const elements2 = project2.circuitsList.reduce((a, c) => a + c.elements.length, 0)
      expect(elements2).toBe(elements1)
    })
  }
})