import { describe, expect, it } from 'vitest'
import { formatValue, maskToWidth, nextNotation } from '../../../../src/core/model/notation'

describe('notation (M3-08)', () => {
  it('formatea en hex con relleno', () => {
    expect(formatValue(5, 4, 'hex')).toBe('0x5')
    expect(formatValue(5, 8, 'hex')).toBe('0x05')
    expect(formatValue(255, 8, 'hex')).toBe('0xFF')
  })
  it('formatea en decimal', () => {
    expect(formatValue(42, 8, 'dec')).toBe('42')
  })
  it('formatea en binario con relleno', () => {
    expect(formatValue(5, 4, 'bin')).toBe('0b0101')
  })
  it('normaliza al ancho', () => {
    expect(maskToWidth(0b111111111, 4)).toBe(0b1111)
    expect(formatValue(0b111111111, 4, 'bin')).toBe('0b1111')
  })
  it('cicla notaciones', () => {
    expect(nextNotation('hex')).toBe('dec')
    expect(nextNotation('dec')).toBe('bin')
    expect(nextNotation('bin')).toBe('hex')
  })
})