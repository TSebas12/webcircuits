import { describe, expect, it } from 'vitest'
import {
  CUSTOM_THEME_KEY,
  THEME_STORAGE_KEY,
  applyTheme,
  clearCustomTheme,
  nextThemeSelection,
  parseThemeSelection,
  readCustomTheme,
  readThemeSelection,
  resolveTheme,
  storeCustomTheme,
  storeThemeSelection,
  themeSelectionLabel,
  type ThemeSelection,
} from '../../../src/app/theme'
import { DARK_THEME, LIGHT_THEME, MONOCHROME_THEME } from '../../../src/core/theme/presets'
import { withToken } from '../../../src/core/theme/theme'

/** Un almacenamiento de mentira, que además puede fallar a voluntad. */
function fakeStorage(
  options: { readonly fail?: boolean; readonly initial?: Record<string, string> } = {},
): Storage {
  const items = new Map(Object.entries(options.initial ?? {}))
  const guard = (): void => {
    if (options.fail === true) {
      throw new Error('almacenamiento bloqueado')
    }
  }

  return {
    get length(): number {
      return items.size
    },
    clear(): void {
      guard()
      items.clear()
    },
    getItem(key: string): string | null {
      guard()
      return items.get(key) ?? null
    },
    key(index: number): string | null {
      guard()
      return [...items.keys()][index] ?? null
    },
    removeItem(key: string): void {
      guard()
      items.delete(key)
    },
    setItem(key: string, value: string): void {
      guard()
      items.set(key, value)
    },
  }
}

/** Un `<html>` de mentira: atributos y variables en línea. */
function fakeRoot(): {
  root: HTMLElement
  theme: () => string | null
  vars: Map<string, string>
} {
  const attributes = new Map<string, string>()
  const vars = new Map<string, string>()
  const element = {
    setAttribute(name: string, value: string): void {
      attributes.set(name, value)
    },
    getAttribute(name: string): string | null {
      return attributes.get(name) ?? null
    },
    style: {
      setProperty(name: string, value: string): void {
        vars.set(name, value)
      },
    },
  }

  return {
    root: element as unknown as HTMLElement,
    theme: () => attributes.get('data-theme') ?? null,
    vars,
  }
}

describe('resolveTheme', () => {
  it('en automático sigue al sistema', () => {
    expect(resolveTheme('auto', true).id).toBe('dark')
    expect(resolveTheme('auto', false).id).toBe('light')
  })

  it('la elección del usuario gana al sistema', () => {
    expect(resolveTheme('light', true).id).toBe('light')
    expect(resolveTheme('dark', false).id).toBe('dark')
  })

  it('los presets se resuelven por id', () => {
    expect(resolveTheme('monochrome', false)).toBe(MONOCHROME_THEME)
  })

  it('un tema propio manda; sin él, se cae al de fábrica', () => {
    const custom = withToken(LIGHT_THEME, 'wire.high', '#123456')
    expect(resolveTheme('custom', false, custom)).toBe(custom)
    expect(resolveTheme('custom', false, null).id).toBe('light')
  })
})

describe('nextThemeSelection', () => {
  it('recorre todos los presets y vuelve a automático', () => {
    const seen: ThemeSelection[] = []
    let selection: ThemeSelection = 'auto'
    for (let i = 0; i < 6; i += 1) {
      selection = nextThemeSelection(selection)
      seen.push(selection)
    }
    expect(seen).toEqual(['light', 'dark', 'high-contrast', 'colorblind', 'monochrome', 'auto'])
  })

  it('desde un tema propio vuelve a automático', () => {
    expect(nextThemeSelection('custom')).toBe('auto')
  })
})

describe('parseThemeSelection', () => {
  it('acepta las elecciones válidas', () => {
    expect(parseThemeSelection('auto')).toBe('auto')
    expect(parseThemeSelection('dark')).toBe('dark')
    expect(parseThemeSelection('custom')).toBe('custom')
    expect(parseThemeSelection('high-contrast')).toBe('high-contrast')
  })

  it('ante cualquier otra cosa se queda en automático', () => {
    expect(parseThemeSelection(null)).toBe('auto')
    expect(parseThemeSelection('')).toBe('auto')
    expect(parseThemeSelection('oscuro')).toBe('auto')
    expect(parseThemeSelection('DARK')).toBe('auto')
  })
})

describe('applyTheme', () => {
  it('escribe las variables del tema y el color-scheme', () => {
    const { root, theme, vars } = fakeRoot()

    applyTheme('dark', { root })
    expect(theme()).toBe('dark')
    expect(vars.get('--wc-wire')).toBe(DARK_THEME.tokens['wire.idle'])
    expect(vars.get('--bg')).toBe(DARK_THEME.tokens['ui.bg'])
    expect(vars.get('color-scheme')).toBe('dark')
  })

  it('un tema propio vuelca sus valores', () => {
    const { root, vars } = fakeRoot()
    const custom = withToken(LIGHT_THEME, 'wire.high', '#abcdef')

    applyTheme('custom', { root, custom })
    expect(vars.get('--wc-wire-high')).toBe('#abcdef')
  })

  it('en automático refleja lo que diga el sistema', () => {
    const { root, theme } = fakeRoot()

    applyTheme('auto', { root, systemPrefersDark: true })
    expect(theme()).toBe('dark')

    applyTheme('auto', { root, systemPrefersDark: false })
    expect(theme()).toBe('light')
  })
})

describe('etiquetas', () => {
  it('nombra presets y temas propios', () => {
    expect(themeSelectionLabel('auto', null)).toBe('Automático')
    expect(themeSelectionLabel('dark', null)).toBe('Oscuro')
    expect(themeSelectionLabel('custom', null)).toBe('Personalizado')
    expect(themeSelectionLabel('custom', MONOCHROME_THEME)).toBe('Monocromo')
  })
})

describe('persistencia', () => {
  it('lo guardado se vuelve a leer', () => {
    const storage = fakeStorage()

    storeThemeSelection('dark', storage)

    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(readThemeSelection(storage)).toBe('dark')
  })

  it('sin nada guardado, automático', () => {
    expect(readThemeSelection(fakeStorage())).toBe('auto')
  })

  it('un almacenamiento bloqueado no rompe la aplicación', () => {
    const blocked = fakeStorage({ fail: true })

    expect(readThemeSelection(blocked)).toBe('auto')
    expect(() => {
      storeThemeSelection('dark', blocked)
    }).not.toThrow()
  })

  it('un valor basura guardado a mano se ignora', () => {
    const storage = fakeStorage({ initial: { [THEME_STORAGE_KEY]: 'neón' } })
    expect(readThemeSelection(storage)).toBe('auto')
  })
})

describe('tema propio', () => {
  it('se guarda y se recupera', () => {
    const storage = fakeStorage()
    const custom = withToken(DARK_THEME, 'wire.low', '#00ff00')

    storeCustomTheme(custom, storage)

    const back = readCustomTheme(storage)
    expect(back?.tokens['wire.low']).toBe('#00ff00')
    expect(back?.base).toBe('dark')
  })

  it('se puede borrar', () => {
    const storage = fakeStorage()
    storeCustomTheme(DARK_THEME, storage)
    clearCustomTheme(storage)
    expect(storage.getItem(CUSTOM_THEME_KEY)).toBeNull()
    expect(readCustomTheme(storage)).toBeNull()
  })

  it('si está corrupto se ignora en vez de romper', () => {
    const storage = fakeStorage({ initial: { [CUSTOM_THEME_KEY]: '{ roto' } })
    expect(readCustomTheme(storage)).toBeNull()
  })
})

describe('script anti-destello de index.html', () => {
  // Se lee en crudo para no depender del sistema de ficheros.
  const pages = import.meta.glob<string>('/index.html', {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  it('usa la misma clave de almacenamiento (si se renombra, que no se olvide)', () => {
    const html = pages['/index.html']
    expect(html).toBeDefined()
    expect(html).toContain(`'${THEME_STORAGE_KEY}'`)
    expect(html).toContain('data-theme')
  })
})
