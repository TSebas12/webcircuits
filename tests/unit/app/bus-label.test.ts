import { describe, expect, it } from 'vitest'
import { busBitRange, busLabelText, formatBusValue } from '../../../src/app/editor/bus-label'

describe('etiqueta de bus (M3B-03)', () => {
  it('muestra nombre, rango y z por defecto', () => {
    expect(busLabelText('Datos', 4, null)).toBe('Datos [3:0] = z')
  })

  it('usa el nombre por defecto y respeta el orden de bits', () => {
    expect(busLabelText('', 2, [0, 1])).toBe('Bus 2 [1:0] = 2')
    expect(busLabelText('  ', 1, [1])).toBe('Bus 1 [0:0] = 1')
  })

  it('si falta un bit no inventa un valor y los buses anchos van en hexadecimal', () => {
    expect(formatBusValue([1, null], 2)).toBe('z')
    expect(busBitRange(12)).toBe('[11:0]')
    expect(formatBusValue(Array.from({ length: 12 }, () => 1), 12)).toBe('0xFFF')
  })
})
