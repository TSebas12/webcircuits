/**
 * Los temas que vienen de fábrica (M6-08..M6-12).
 *
 * Son datos: cada preset es un `Theme` completo. El usuario puede partir de uno para crear el
 * suyo (`M6-13`) o forzar el color de un cable concreto (`M6-14`).
 *
 * Criterios:
 * - **Claro / Oscuro**: los de siempre, cómodos para trabajar.
 * - **Alto contraste**: negro/amarillo-blanco, pensado para verse con poca vista.
 * - **Daltónico**: paleta segura (Okabe-Ito), con el azul/naranja separados en vez de rojo/verde.
 * - **Monocromo**: solo grises, para imprimir en blanco y negro.
 */

import type { Theme } from './theme'
import type { TokenValues } from './tokens'

const FONTS = {
  'font.sans': "system-ui, 'Segoe UI', Roboto, sans-serif",
  'font.mono': "ui-monospace, Consolas, 'Courier New', monospace",
  'font.baseSize': '16px',
} satisfies Partial<TokenValues>

const LIGHT_UI = {
  'ui.bg': '#f6f7f9',
  'ui.fg': '#191c21',
  'ui.fgMuted': '#5d646f',
  'ui.panel': '#ffffff',
  'ui.panelHover': '#f1f3f6',
  'ui.border': '#e3e6ea',
  'ui.accent': '#2f6fc0',
  'ui.accentFg': '#ffffff',
} satisfies Partial<TokenValues>

const DARK_UI = {
  'ui.bg': '#0f1115',
  'ui.fg': '#e7e9ee',
  'ui.fgMuted': '#99a1ad',
  'ui.panel': '#16191f',
  'ui.panelHover': '#1e232b',
  'ui.border': '#262b33',
  'ui.accent': '#60a5fa',
  'ui.accentFg': '#0b1220',
} satisfies Partial<TokenValues>

/** Tema claro. Es el de respaldo cuando no hay nada guardado. */
export const LIGHT_THEME: Theme = {
  id: 'light',
  name: 'Claro',
  author: 'WebCircuits',
  version: 1,
  base: 'light',
  tokens: {
    'canvas.background': '#fbfbfd',
    'canvas.grid': '#d5d9e0',
    'canvas.gridStrong': '#aeb5c1',
    'wire.idle': '#22252b',
    'wire.high': '#d93025',
    'wire.low': '#1565c0',
    'wire.floating': '#9aa0a6',
    'wire.bus': '#7c4dff',
    'wire.selected': '#3b82f6',
    'gate.fill': '#ffffff',
    'gate.stroke': '#22252b',
    'gate.text': '#191c21',
    'gate.error': '#d93025',
    'state.off': '#b7c9b8',
    'state.zero': '#5b4949',
    'state.one': '#ff4a1f',
    'interaction.selection': '#3b82f6',
    'interaction.hover': '#7aa7f0',
    'interaction.pinDot': '#8b93a1',
    'interaction.handle': '#3b82f6',
    ...LIGHT_UI,
    ...FONTS,
  },
}

export const DARK_THEME: Theme = {
  id: 'dark',
  name: 'Oscuro',
  author: 'WebCircuits',
  version: 1,
  base: 'dark',
  tokens: {
    'canvas.background': '#101318',
    'canvas.grid': '#242932',
    'canvas.gridStrong': '#3a414c',
    'wire.idle': '#e7e9ee',
    'wire.high': '#ff5a2a',
    'wire.low': '#4a9eff',
    'wire.floating': '#6b7280',
    'wire.bus': '#b388ff',
    'wire.selected': '#60a5fa',
    'gate.fill': '#1a1e25',
    'gate.stroke': '#e7e9ee',
    'gate.text': '#e7e9ee',
    'gate.error': '#ff6b5e',
    'state.off': '#3c4a3e',
    'state.zero': '#5b4949',
    'state.one': '#ff5a2a',
    'interaction.selection': '#60a5fa',
    'interaction.hover': '#7fb0ff',
    'interaction.pinDot': '#6b7280',
    'interaction.handle': '#60a5fa',
    ...DARK_UI,
    ...FONTS,
  },
}

/** Alto contraste (AA/AAA): fondo negro, trazos blancos y acentos amarillos. */
export const HIGH_CONTRAST_THEME: Theme = {
  id: 'high-contrast',
  name: 'Alto contraste',
  author: 'WebCircuits',
  version: 1,
  base: 'dark',
  tokens: {
    'canvas.background': '#000000',
    'canvas.grid': '#3a3a3a',
    'canvas.gridStrong': '#6a6a6a',
    'wire.idle': '#ffffff',
    'wire.high': '#ff2d2d',
    'wire.low': '#4da3ff',
    'wire.floating': '#b0b0b0',
    'wire.bus': '#ffd400',
    'wire.selected': '#ffff00',
    'gate.fill': '#000000',
    'gate.stroke': '#ffffff',
    'gate.text': '#ffffff',
    'gate.error': '#ff2d2d',
    'state.off': '#444444',
    'state.zero': '#ffd400',
    'state.one': '#00e676',
    'interaction.selection': '#ffff00',
    'interaction.hover': '#ffffff',
    'interaction.pinDot': '#cccccc',
    'interaction.handle': '#ffff00',
    'ui.bg': '#000000',
    'ui.fg': '#ffffff',
    'ui.fgMuted': '#cccccc',
    'ui.panel': '#0a0a0a',
    'ui.panelHover': '#1a1a1a',
    'ui.border': '#ffffff',
    'ui.accent': '#ffff00',
    'ui.accentFg': '#000000',
    ...FONTS,
  },
}

/**
 * Daltónico: paleta segura de Okabe-Ito.
 *
 * Además del color, el dibujado distingue por **forma** (el cable flotante va discontinuo y el
 * bus va más grueso), para no depender solo del color.
 */
export const COLORBLIND_THEME: Theme = {
  id: 'colorblind',
  name: 'Daltónico',
  author: 'WebCircuits',
  version: 1,
  base: 'light',
  tokens: {
    'canvas.background': '#fbfbfd',
    'canvas.grid': '#d5d9e0',
    'canvas.gridStrong': '#aeb5c1',
    'wire.idle': '#333333',
    'wire.high': '#0072b2',
    'wire.low': '#e69f00',
    'wire.floating': '#999999',
    'wire.bus': '#cc79a7',
    'wire.selected': '#56b4e9',
    'gate.fill': '#ffffff',
    'gate.stroke': '#333333',
    'gate.text': '#1a1a1a',
    'gate.error': '#d55e00',
    'state.off': '#cfd8d0',
    'state.zero': '#e69f00',
    'state.one': '#0072b2',
    'interaction.selection': '#0072b2',
    'interaction.hover': '#56b4e9',
    'interaction.pinDot': '#8b93a1',
    'interaction.handle': '#0072b2',
    ...LIGHT_UI,
    ...FONTS,
  },
}

/** Monocromo: solo grises, pensado para imprimir. */
export const MONOCHROME_THEME: Theme = {
  id: 'monochrome',
  name: 'Monocromo',
  author: 'WebCircuits',
  version: 1,
  base: 'light',
  tokens: {
    'canvas.background': '#ffffff',
    'canvas.grid': '#dddddd',
    'canvas.gridStrong': '#bbbbbb',
    'wire.idle': '#111111',
    'wire.high': '#111111',
    'wire.low': '#666666',
    'wire.floating': '#aaaaaa',
    'wire.bus': '#000000',
    'wire.selected': '#444444',
    'gate.fill': '#ffffff',
    'gate.stroke': '#111111',
    'gate.text': '#111111',
    'gate.error': '#000000',
    'state.off': '#e0e0e0',
    'state.zero': '#999999',
    'state.one': '#333333',
    'interaction.selection': '#555555',
    'interaction.hover': '#888888',
    'interaction.pinDot': '#aaaaaa',
    'interaction.handle': '#555555',
    'ui.bg': '#ffffff',
    'ui.fg': '#111111',
    'ui.fgMuted': '#555555',
    'ui.panel': '#ffffff',
    'ui.panelHover': '#eeeeee',
    'ui.border': '#cccccc',
    'ui.accent': '#333333',
    'ui.accentFg': '#ffffff',
    ...FONTS,
  },
}

/** Todos los presets, en orden de presentación. */
export const PRESETS: readonly Theme[] = [
  LIGHT_THEME,
  DARK_THEME,
  HIGH_CONTRAST_THEME,
  COLORBLIND_THEME,
  MONOCHROME_THEME,
]

/** El preset por defecto. */
export const DEFAULT_THEME = LIGHT_THEME

/** Busca un preset por id. */
export function presetById(id: string): Theme | undefined {
  return PRESETS.find((preset) => preset.id === id)
}

/** ¿Existe un preset con este id? */
export function isPresetId(id: string): boolean {
  return presetById(id) !== undefined
}
