// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { importCircuitProject, exportCircuitProject } from '../../../src/core/persist/circuitproject'

const FIXTURES = join(process.cwd(), 'tests', 'fixtures')

describe('M4-11 ida y vuelta con fixtures', () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.CircuitProject'))
  it('hay fixtures que probar', () => {
    expect(files.length).toBeGreaterThan(0)
  })
  for (const file of files) {
    it(`round-trip: ${file}`, { timeout: 120000 }, () => {
      const xml = readFileSync(join(FIXTURES, file), 'utf8')
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