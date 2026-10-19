import { describe, expect, it } from 'vitest'
import { TOKEN_GROUPS, TOKENS, TOKEN_IDS, tokenDef } from '../../../../src/core/theme/tokens'
import { PRESETS, DEFAULT_THEME, presetById, isPresetId } from '../../../../src/core/theme/presets'

describe('catálogo de tokens', () => {
  it('no repite identificadores ni variables CSS', () => {
    const ids = new Set(TOKENS.map((t) => t.id))
    const vars = new Set(TOKENS.map((t) => t.varName))
    expect(ids.size).toBe(TOKENS.length)
    expect(vars.size).toBe(TOKENS.length)
  })

  it('cada token pertenece a un grupo declarado', () => {
    const groups = new Set(TOKEN_GROUPS.map((g) => g.id))
    for (const token of TOKENS) {
      expect(groups.has(token.group)).toBe(true)
    }
  })

  it('TOKEN_IDS coincide con TOKENS', () => {
    expect(TOKEN_IDS).toHaveLength(TOKENS.length)
    expect([...TOKEN_IDS]).toEqual(TOKENS.map((t) => t.id))
  })

  it('tokenDef encuentra y no inventa', () => {
    expect(tokenDef('wire.high')?.varName).toBe('--wc-wire-high')
    expect(tokenDef('no.existe' as never)).toBeUndefined()
  })
})

describe('presets', () => {
  it('cada preset define todos los tokens', () => {
    for (const preset of PRESETS) {
      for (const id of TOKEN_IDS) {
        expect(preset.tokens[id], `${preset.id} → ${id}`).toBeTruthy()
      }
    }
  })

  it('los identificadores son únicos', () => {
    const ids = PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('solo usa `base` válidos', () => {
    for (const preset of PRESETS) {
      expect(['light', 'dark']).toContain(preset.base)
    }
  })

  it('busca por id', () => {
    expect(presetById('dark')?.name).toBe('Oscuro')
    expect(presetById('no-existe')).toBeUndefined()
    expect(isPresetId('dark')).toBe(true)
    expect(isPresetId('custom')).toBe(false)
  })

  it('el preset por defecto es uno de los declarados', () => {
    expect(PRESETS).toContain(DEFAULT_THEME)
  })
})
