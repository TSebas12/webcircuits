/**
 * Catálogo de tokens de tema (M6-01..M6-07).
 *
 * Un **token** es una pieza de aspecto con nombre: el color de un cable encendido, el fondo
 * del lienzo, la tipografía… es la lista de todo lo que un tema puede cambiar.
 *
 * Este fichero es **puro**: no sabe de CSS ni del navegador. Solo dice *qué* tokens existen y
 * cómo se llaman; el valor de cada uno lo pone un `Theme` (`theme.ts`) y quien los vuelca al
 * documento es la aplicación (`app/theme.ts`).
 *
 * `varName` es el nombre de la *custom property* CSS donde acaba el valor. Es la única
 * conexión entre este catálogo y `app.css`: si aquí se añade un token, hay que añadir su
 * variable allí (aunque solo sea como valor de respaldo).
 */

/** Los grupos en que se agrupan los tokens de cara a la interfaz. */
export type TokenGroup = 'canvas' | 'wire' | 'gate' | 'interaction' | 'state' | 'ui' | 'font'

/** De qué tipo es el valor: un color, una familia tipográfica o un tamaño. */
export type TokenKind = 'color' | 'font' | 'size'

export interface TokenDef {
  /** Identificador estable (`wire.high`). Es la clave dentro de un `Theme`. */
  readonly id: string
  readonly group: TokenGroup
  readonly kind: TokenKind
  /** Nombre legible para el editor. */
  readonly label: string
  /** Variable CSS donde se vuelca (`--wc-wire-high`). */
  readonly varName: string
  /** Ayuda corta para el editor. */
  readonly hint?: string
}

/** Orden de los grupos en el editor. */
export const TOKEN_GROUPS: readonly { readonly id: TokenGroup; readonly label: string }[] = [
  { id: 'canvas', label: 'Lienzo' },
  { id: 'wire', label: 'Cables' },
  { id: 'gate', label: 'Compuertas' },
  { id: 'state', label: 'Estados' },
  { id: 'interaction', label: 'Interacción' },
  { id: 'ui', label: 'Interfaz' },
  { id: 'font', label: 'Tipografía' },
]

/** Todos los tokens, en orden de presentación. */
export const TOKENS: readonly TokenDef[] = [
  // ── Lienzo ──────────────────────────────────────────────────────────────
  { id: 'canvas.background', group: 'canvas', kind: 'color', label: 'Fondo', varName: '--wc-diagram-bg' },
  { id: 'canvas.grid', group: 'canvas', kind: 'color', label: 'Rejilla', varName: '--wc-grid-dot' },
  {
    id: 'canvas.gridStrong',
    group: 'canvas',
    kind: 'color',
    label: 'Rejilla (marcada)',
    varName: '--wc-grid-dot-strong',
    hint: 'El punto de referencia cada 5 celdas',
  },

  // ── Cables ──────────────────────────────────────────────────────────────
  { id: 'wire.idle', group: 'wire', kind: 'color', label: 'En reposo', varName: '--wc-wire' },
  { id: 'wire.high', group: 'wire', kind: 'color', label: 'Alto (1)', varName: '--wc-wire-high' },
  { id: 'wire.low', group: 'wire', kind: 'color', label: 'Bajo (0)', varName: '--wc-wire-low' },
  {
    id: 'wire.floating',
    group: 'wire',
    kind: 'color',
    label: 'Flotante',
    varName: '--wc-wire-floating',
    hint: 'Sin nada que lo fije',
  },
  { id: 'wire.bus', group: 'wire', kind: 'color', label: 'Bus', varName: '--wc-wire-bus' },
  { id: 'wire.selected', group: 'wire', kind: 'color', label: 'Seleccionado', varName: '--wc-wire-selected' },

  // ── Compuertas ──────────────────────────────────────────────────────────
  { id: 'gate.fill', group: 'gate', kind: 'color', label: 'Relleno', varName: '--wc-symbol-fill' },
  { id: 'gate.stroke', group: 'gate', kind: 'color', label: 'Borde', varName: '--wc-symbol-stroke' },
  { id: 'gate.text', group: 'gate', kind: 'color', label: 'Texto', varName: '--wc-gate-text' },
  { id: 'gate.error', group: 'gate', kind: 'color', label: 'Error', varName: '--wc-error' },

  // ── Estados de un dispositivo ───────────────────────────────────────────
  { id: 'state.off', group: 'state', kind: 'color', label: 'Apagado', varName: '--wc-state-off' },
  { id: 'state.zero', group: 'state', kind: 'color', label: 'Encendido (0)', varName: '--wc-state-zero' },
  { id: 'state.one', group: 'state', kind: 'color', label: 'Encendido (1)', varName: '--wc-state-one' },

  // ── Interacción ─────────────────────────────────────────────────────────
  { id: 'interaction.selection', group: 'interaction', kind: 'color', label: 'Selección', varName: '--wc-selection' },
  { id: 'interaction.hover', group: 'interaction', kind: 'color', label: 'Hover', varName: '--wc-hover' },
  { id: 'interaction.pinDot', group: 'interaction', kind: 'color', label: 'Punto de pin', varName: '--wc-pin-dot' },
  { id: 'interaction.handle', group: 'interaction', kind: 'color', label: 'Tiradores', varName: '--wc-handle' },

  // ── Interfaz (cromo) ────────────────────────────────────────────────────
  { id: 'ui.bg', group: 'ui', kind: 'color', label: 'Fondo', varName: '--bg' },
  { id: 'ui.fg', group: 'ui', kind: 'color', label: 'Texto', varName: '--fg' },
  { id: 'ui.fgMuted', group: 'ui', kind: 'color', label: 'Texto suave', varName: '--fg-muted' },
  { id: 'ui.panel', group: 'ui', kind: 'color', label: 'Paneles', varName: '--panel-bg' },
  { id: 'ui.panelHover', group: 'ui', kind: 'color', label: 'Paneles (hover)', varName: '--panel-bg-hover' },
  { id: 'ui.border', group: 'ui', kind: 'color', label: 'Bordes', varName: '--border' },
  { id: 'ui.accent', group: 'ui', kind: 'color', label: 'Acento', varName: '--accent' },
  { id: 'ui.accentFg', group: 'ui', kind: 'color', label: 'Texto sobre el acento', varName: '--accent-fg' },

  // ── Tipografía ──────────────────────────────────────────────────────────
  { id: 'font.sans', group: 'font', kind: 'font', label: 'Familia', varName: '--font-sans' },
  { id: 'font.mono', group: 'font', kind: 'font', label: 'Familia monoespaciada', varName: '--font-mono' },
  { id: 'font.baseSize', group: 'font', kind: 'size', label: 'Tamaño base', varName: '--wc-font-size' },
]

/** Todos los identificadores de token, como tipo. */
export type TokenId =
  | 'canvas.background'
  | 'canvas.grid'
  | 'canvas.gridStrong'
  | 'wire.idle'
  | 'wire.high'
  | 'wire.low'
  | 'wire.floating'
  | 'wire.bus'
  | 'wire.selected'
  | 'gate.fill'
  | 'gate.stroke'
  | 'gate.text'
  | 'gate.error'
  | 'state.off'
  | 'state.zero'
  | 'state.one'
  | 'interaction.selection'
  | 'interaction.hover'
  | 'interaction.pinDot'
  | 'interaction.handle'
  | 'ui.bg'
  | 'ui.fg'
  | 'ui.fgMuted'
  | 'ui.panel'
  | 'ui.panelHover'
  | 'ui.border'
  | 'ui.accent'
  | 'ui.accentFg'
  | 'font.sans'
  | 'font.mono'
  | 'font.baseSize'

/** Lista de ids, para recorrerla sin depender del orden de `TOKENS`. */
export const TOKEN_IDS: readonly TokenId[] = TOKENS.map((t) => t.id as TokenId)

const BY_ID = new Map<string, TokenDef>(TOKENS.map((t) => [t.id, t]))

/** Busca la definición de un token. */
export function tokenDef(id: TokenId): TokenDef | undefined {
  return BY_ID.get(id)
}

/** Todos los valores de un tema (uno por token). */
export type TokenValues = Readonly<Record<TokenId, string>>
