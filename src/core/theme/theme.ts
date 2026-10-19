/**
 * El modelo de tema (M6-01).
 *
 * Un `Theme` es **datos puros** y serializables: un nombre, quién lo hizo, una versión y el
 * valor de cada token del catálogo (`tokens.ts`). Nada de funciones ni de DOM, así que se
 * puede probar, guardar en JSON y compartir sin tocar el navegador.
 *
 * `base` (`light`/`dark`) no es un color: es lo que decide el `color-scheme` (barras de
 * scroll, controles nativos) y lo que usa el script anti-destello de `index.html` para evitar
 * el fogonazo al cargar. Un tema de alto contraste puede ser oscuro o claro; aquí se dice.
 */

import { TOKEN_IDS, tokenDef, type TokenId, type TokenValues } from './tokens'

/** Lo que el script anti-destello necesita saber antes de que arranque la aplicación. */
export type ThemeBase = 'light' | 'dark'

export interface Theme {
  /** Identificador estable. Los presets usan uno fijo (`dark`); los propios, `custom`. */
  readonly id: string
  readonly name: string
  readonly author: string
  /** Versión del *tema* (no del formato). Sirve para saber si ha cambiado. */
  readonly version: number
  readonly base: ThemeBase
  readonly tokens: TokenValues
}

/** Marca y versión del fichero de tema exportable (M6-17). */
export const THEME_FORMAT = 'webcircuits-theme'
export const THEME_FORMAT_VERSION = 1

export interface SerializedTheme {
  readonly format: string
  readonly formatVersion: number
  readonly id: string
  readonly name: string
  readonly author: string
  readonly version: number
  readonly base: ThemeBase
  readonly tokens: Record<string, string>
}

/** Copia un tema cambiando un token. Devuelve un tema nuevo (inmutable). */
export function withToken(theme: Theme, id: TokenId, value: string): Theme {
  return { ...theme, tokens: { ...theme.tokens, [id]: value } }
}

/** Copia un tema cambiando varios tokens a la vez. */
export function withTokens(theme: Theme, values: Partial<Record<TokenId, string>>): Theme {
  return { ...theme, tokens: { ...theme.tokens, ...values } }
}

/**
 * Rellena los tokens que falten con los de otro conjunto.
 *
 * Sirve para dos cosas: completar un tema propio que solo cambia unos pocos tokens y aguantar
 * ficheros de una versión anterior a la que le falten tokens nuevos sin reventar.
 */
export function mergeTokens(base: TokenValues, overrides: Partial<Record<string, string>>): TokenValues {
  const out: Record<string, string> = {}
  for (const id of TOKEN_IDS) {
    out[id] = overrides[id] ?? base[id]
  }
  return out as TokenValues
}

/** ¿Es `value` un `ThemeBase`? */
function isBase(value: unknown): value is ThemeBase {
  return value === 'light' || value === 'dark'
}

/** Convierte un tema en texto JSON (para exportar o guardar). */
export function serializeTheme(theme: Theme): string {
  const serialized: SerializedTheme = {
    format: THEME_FORMAT,
    formatVersion: THEME_FORMAT_VERSION,
    id: theme.id,
    name: theme.name,
    author: theme.author,
    version: theme.version,
    base: theme.base,
    tokens: { ...theme.tokens },
  }
  return JSON.stringify(serialized, null, 2)
}

/**
 * Lee un tema de un texto JSON.
 *
 * Es estricto con lo que identifica al fichero (marca, `base`, nombre) y tolerante con los
 * tokens: los desconocidos se ignoran y los que falten se toman de `fallback`. Así un fichero
 * hecho con una versión más vieja sigue cargando.
 *
 * Lanza `Error` si el texto no es un tema; el llamante decide qué enseñar.
 */
export function parseTheme(text: string, fallback: TokenValues): Theme {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('El tema no es JSON válido')
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('El tema no es un objeto')
  }
  const data = raw as Record<string, unknown>
  if (data['format'] !== THEME_FORMAT) {
    throw new Error('El fichero no es un tema de WebCircuits')
  }
  if (!isBase(data['base'])) {
    throw new Error('Al tema le falta un `base` válido (light/dark)')
  }

  const rawTokens = data['tokens']
  const overrides: Record<string, string> = {}
  if (typeof rawTokens === 'object' && rawTokens !== null) {
    for (const [id, value] of Object.entries(rawTokens as Record<string, unknown>)) {
      // Solo se aceptan tokens conocidos y valores de texto: lo demás se ignora.
      if (typeof value === 'string' && tokenDef(id as TokenId) !== undefined) {
        overrides[id] = value
      }
    }
  }

  return {
    id: typeof data['id'] === 'string' && data['id'] !== '' ? data['id'] : 'custom',
    name: typeof data['name'] === 'string' && data['name'] !== '' ? data['name'] : 'Tema importado',
    author: typeof data['author'] === 'string' ? data['author'] : '',
    version: typeof data['version'] === 'number' ? data['version'] : 1,
    base: data['base'],
    tokens: mergeTokens(fallback, overrides),
  }
}

/** El mapa de variable CSS → valor que hay que volcar al documento. */
export function cssVarsFor(theme: Theme): ReadonlyMap<string, string> {
  const vars = new Map<string, string>()
  for (const id of TOKEN_IDS) {
    const def = tokenDef(id)
    if (def !== undefined) {
      vars.set(def.varName, theme.tokens[id])
    }
  }
  return vars
}
