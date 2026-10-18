import { describe, expect, it } from 'vitest'

/**
 * Test de humo (M0-09). No prueba nada del simulador: prueba que el
 * andamiaje de tests funciona.
 */
describe('entorno de tests', () => {
  it('ejecuta TypeScript correctamente', () => {
    const sum = (a: number, b: number): number => a + b
    expect(sum(2, 3)).toBe(5)
  })

  it('es independiente de la cultura del sistema', () => {
    // LECCIÓN DEL ORÁCULO (docs/BASELINE-TESTS.md):
    // el original falla en equipos es-ES porque hace `Double.Parse("19.7")`.
    // En JavaScript `Number()` siempre usa el punto decimal, pase lo que pase.
    expect(Number('19.7')).toBe(19.7)
    expect((19.7).toFixed(1)).toBe('19.7')
  })
})
