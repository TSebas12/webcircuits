import { describe, expect, it } from 'vitest'
import {
  AA_TEXT,
  contrastHex,
  contrastRatio,
  meetsAA,
  meetsAAA,
  parseHex,
  relativeLuminance,
} from '../../../../src/core/theme/contrast'
import { PRESETS } from '../../../../src/core/theme/presets'

describe('parseHex', () => {
  it('entiende 6 dígitos', () => {
    expect(parseHex('#ff8000')).toEqual({ r: 255, g: 128, b: 0 })
  })

  it('expande la forma corta', () => {
    expect(parseHex('#f80')).toEqual({ r: 255, g: 136, b: 0 })
  })

  it('rechaza lo que no es hexadecimal', () => {
    expect(() => parseHex('rojo')).toThrow()
    expect(() => parseHex('#12')).toThrow()
  })
})

describe('relativeLuminance', () => {
  it('negro y blanco son los extremos', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
  })
})

describe('contrastRatio', () => {
  it('blanco sobre negro es 21', () => {
    expect(contrastHex('#ffffff', '#000000')).toBeCloseTo(21, 2)
  })

  it('un color consigo mismo es 1', () => {
    expect(contrastHex('#345678', '#345678')).toBeCloseTo(1, 5)
  })

  it('el orden no importa', () => {
    expect(contrastRatio(parseHex('#111111'), parseHex('#eeeeee'))).toBeCloseTo(
      contrastRatio(parseHex('#eeeeee'), parseHex('#111111')),
      10,
    )
  })
})

describe('umbrales WCAG', () => {
  it('AA y AAA', () => {
    expect(meetsAA(AA_TEXT)).toBe(true)
    expect(meetsAA(AA_TEXT - 0.1)).toBe(false)
    expect(meetsAAA(7)).toBe(true)
    expect(meetsAAA(6.9)).toBe(false)
  })
})

describe('M6-19 · los presets cumplen AA en el texto', () => {
  it('texto sobre el fondo de la interfaz', () => {
    for (const preset of PRESETS) {
      const ratio = contrastHex(preset.tokens['ui.fg'], preset.tokens['ui.bg'])
      expect(ratio, `${preset.id}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT)
    }
  })

  it('texto sobre el relleno de las compuertas', () => {
    for (const preset of PRESETS) {
      const ratio = contrastHex(preset.tokens['gate.text'], preset.tokens['gate.fill'])
      expect(ratio, `${preset.id}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT)
    }
  })

  it('el cable se distingue del lienzo (al menos 3:1)', () => {
    for (const preset of PRESETS) {
      const ratio = contrastHex(preset.tokens['wire.idle'], preset.tokens['canvas.background'])
      expect(ratio, `${preset.id}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('el texto de un botón de acento se lee (AA)', () => {
    for (const preset of PRESETS) {
      const ratio = contrastHex(preset.tokens['ui.accentFg'], preset.tokens['ui.accent'])
      expect(ratio, `${preset.id}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA_TEXT)
    }
  })
})
