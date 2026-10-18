import { describe, expect, it } from 'vitest'
import {
  THEME_STORAGE_KEY,
  applyTheme,
  nextThemeChoice,
  parseThemeChoice,
  readThemeChoice,
  resolveTheme,
  storeThemeChoice,
  type ThemeChoice,
} from '../../../src/app/theme'

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

/** Un `<html>` de mentira, que solo apunta el atributo `data-theme`. */
function fakeRoot(): { root: HTMLElement; theme: () => string | null } {
  const attributes = new Map<string, string>()
  const element = {
    setAttribute(name: string, value: string): void {
      attributes.set(name, value)
    },
    removeAttribute(name: string): void {
      attributes.delete(name)
    },
    getAttribute(name: string): string | null {
      return attributes.get(name) ?? null
    },
  }

  return {
    root: element as unknown as HTMLElement,
    theme: () => attributes.get('data-theme') ?? null,
  }
}

describe('resolveTheme', () => {
  it('en automático sigue al sistema', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
  })

  it('la elección del usuario gana al sistema', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('nextThemeChoice', () => {
  it('cicla automático → claro → oscuro → automático', () => {
    expect(nextThemeChoice('auto')).toBe('light')
    expect(nextThemeChoice('light')).toBe('dark')
    expect(nextThemeChoice('dark')).toBe('auto')
  })

  it('tres pulsaciones devuelven al punto de partida', () => {
    let choice: ThemeChoice = 'auto'
    for (let i = 0; i < 3; i += 1) {
      choice = nextThemeChoice(choice)
    }
    expect(choice).toBe('auto')
  })
})

describe('parseThemeChoice', () => {
  it('acepta las tres elecciones válidas', () => {
    expect(parseThemeChoice('auto')).toBe('auto')
    expect(parseThemeChoice('light')).toBe('light')
    expect(parseThemeChoice('dark')).toBe('dark')
  })

  it('ante cualquier otra cosa se queda en automático', () => {
    expect(parseThemeChoice(null)).toBe('auto')
    expect(parseThemeChoice('')).toBe('auto')
    expect(parseThemeChoice('oscuro')).toBe('auto')
    expect(parseThemeChoice('DARK')).toBe('auto')
  })
})

describe('applyTheme', () => {
  it('escribe el tema resuelto en el documento y lo devuelve', () => {
    const { root, theme } = fakeRoot()

    expect(applyTheme('dark', false, root)).toBe('dark')
    expect(theme()).toBe('dark')

    expect(applyTheme('light', true, root)).toBe('light')
    expect(theme()).toBe('light')
  })

  it('en automático refleja lo que diga el sistema', () => {
    const { root, theme } = fakeRoot()

    applyTheme('auto', true, root)
    expect(theme()).toBe('dark')

    applyTheme('auto', false, root)
    expect(theme()).toBe('light')
  })
})

describe('persistencia', () => {
  it('lo guardado se vuelve a leer', () => {
    const storage = fakeStorage()

    storeThemeChoice('dark', storage)

    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(readThemeChoice(storage)).toBe('dark')
  })

  it('sin nada guardado, automático', () => {
    expect(readThemeChoice(fakeStorage())).toBe('auto')
  })

  it('un almacenamiento bloqueado no rompe la aplicación', () => {
    const blocked = fakeStorage({ fail: true })

    expect(readThemeChoice(blocked)).toBe('auto')
    expect(() => {
      storeThemeChoice('dark', blocked)
    }).not.toThrow()
  })

  it('un valor basura guardado a mano se ignora', () => {
    const storage = fakeStorage({ initial: { [THEME_STORAGE_KEY]: 'neón' } })
    expect(readThemeChoice(storage)).toBe('auto')
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
