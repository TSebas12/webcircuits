import { describe, expect, it } from 'vitest'
import { DARK_THEME, LIGHT_THEME, PRESETS } from '../../../../src/core/theme/presets'
import { TOKEN_IDS } from '../../../../src/core/theme/tokens'
import {
  THEME_FORMAT,
  cssVarsFor,
  mergeTokens,
  parseTheme,
  serializeTheme,
  withToken,
} from '../../../../src/core/theme/theme'

describe('mergeTokens', () => {
  it('rellena lo que falta con la base', () => {
    const merged = mergeTokens(LIGHT_THEME.tokens, { 'wire.idle': '#123456' })
    expect(merged['wire.idle']).toBe('#123456')
    expect(merged['wire.high']).toBe(LIGHT_THEME.tokens['wire.high'])
  })

  it('devuelve un valor para todos los tokens', () => {
    const merged = mergeTokens(LIGHT_THEME.tokens, {})
    for (const id of TOKEN_IDS) {
      expect(merged[id]).toBeTruthy()
    }
  })
})

describe('withToken', () => {
  it('no muta el original', () => {
    const next = withToken(LIGHT_THEME, 'wire.idle', '#abcdef')
    expect(next.tokens['wire.idle']).toBe('#abcdef')
    expect(LIGHT_THEME.tokens['wire.idle']).not.toBe('#abcdef')
  })
})

describe('serializar / parsear', () => {
  it('ida y vuelta conserva el tema', () => {
    const text = serializeTheme(DARK_THEME)
    const back = parseTheme(text, LIGHT_THEME.tokens)
    expect(back.id).toBe(DARK_THEME.id)
    expect(back.base).toBe('dark')
    expect(back.tokens).toEqual(DARK_THEME.tokens)
  })

  it('rellena los tokens que falten desde la base', () => {
    const partial = JSON.stringify({
      format: THEME_FORMAT,
      base: 'light',
      name: 'A medias',
      tokens: { 'wire.high': '#ff0000' },
    })
    const theme = parseTheme(partial, LIGHT_THEME.tokens)
    expect(theme.tokens['wire.high']).toBe('#ff0000')
    expect(theme.tokens['wire.low']).toBe(LIGHT_THEME.tokens['wire.low'])
  })

  it('ignora tokens desconocidos', () => {
    const text = JSON.stringify({
      format: THEME_FORMAT,
      base: 'light',
      tokens: { 'wire.high': '#ff0000', 'inventado.x': '#000' },
    })
    const theme = parseTheme(text, LIGHT_THEME.tokens)
    expect('inventado.x' in theme.tokens).toBe(false)
  })

  it('rechaza lo que no es un tema', () => {
    expect(() => parseTheme('no es json', LIGHT_THEME.tokens)).toThrow()
    expect(() => parseTheme('{}', LIGHT_THEME.tokens)).toThrow()
    expect(() => parseTheme(JSON.stringify({ format: 'otra-cosa', base: 'light' }), LIGHT_THEME.tokens)).toThrow()
    expect(() =>
      parseTheme(JSON.stringify({ format: THEME_FORMAT, base: 'raro' }), LIGHT_THEME.tokens),
    ).toThrow()
  })
})

describe('cssVarsFor', () => {
  it('traduce cada token a su variable CSS', () => {
    const vars = cssVarsFor(LIGHT_THEME)
    expect(vars.get('--wc-wire')).toBe(LIGHT_THEME.tokens['wire.idle'])
    expect(vars.get('--bg')).toBe(LIGHT_THEME.tokens['ui.bg'])
    expect(vars.size).toBe(TOKEN_IDS.length)
  })

  it('todos los presets producen el mismo número de variables', () => {
    for (const preset of PRESETS) {
      expect(cssVarsFor(preset).size).toBe(TOKEN_IDS.length)
    }
  })
})
