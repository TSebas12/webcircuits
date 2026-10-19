import type { RenderTheme } from '../../../src/render/ir-renderer'

/**
 * Un tema de mentira para los tests.
 *
 * Los colores son los del tema claro, pero da igual cuáles sean: lo que se comprueba en
 * los tests es **qué** color se usa y **cuándo**, no cuál es. Tenerlos en un solo sitio
 * evita que añadir un color nuevo rompa diez ficheros de test.
 */
export const TEST_THEME: RenderTheme = {
  background: '#ffffff',
  gridDot: '#d5d9e0',
  gridDotStrong: '#aeb5c1',
  wireIdle: '#22252b',
  wireHigh: '#d93025',
  wireLow: '#1565c0',
  wireFloating: '#9aa0a6',
  wireBus: '#7c4dff',
  wireSelected: '#3b82f6',
  symbolFill: '#ffffff',
  symbolStroke: '#22252b',
  gateText: '#191c21',
  gateError: '#d93025',
  selection: '#3b82f6',
  hover: '#7aa7f0',
  pinDot: '#8b93a1',
  handle: '#3b82f6',
  stateOff: '#b7c9b8',
  stateZero: '#5b4949',
  stateOne: '#ff4a1f',
}
