/**
 * La cuña: el triángulo del NOT y de los dos tri-estados (M2-27).
 *
 * Traducida de `SymbolShapes/ShapedNot.xaml`, `ShapedTriState1.xaml` y `ShapedTriState2.xaml`.
 * Las tres son el **mismo** triángulo; los tri-estados le añaden la raya de habilitación, que
 * asoma por abajo (`triState1`) o por arriba (`triState2`), que es donde el modelo les pone el
 * pin de habilitación (`layout.ts`: `inputPin('bottom')` / `inputPin('top')`).
 *
 * Como la AND, la forma va normalizada a unidades de rejilla y **la caja la manda el modelo**.
 * Dos decisiones sobre el original, las dos de encaje:
 *
 * 1. El original dibuja la forma **de tamaño fijo** (54 px = 3 unidades) y la centra en la caja
 *    (`VerticalAlignment="Center"`), así que una NOT de 3×4 no se estira: se ve la cuña de 3×3
 *    en medio. Aquí se hace lo mismo.
 * 2. El original deja un pelo de margen (la base del triángulo está en x=1 de 54, no en 0) y
 *    la punta se queda en x=53. Aquí la cuña **toca la caja**: es justo donde llegan los
 *    cables, y con el trazo de por medio el pelo no se ve.
 */

import type { SymbolDrawing } from './index'

/** Alto de la cuña, en unidades de rejilla (el original: 54 px). */
const WEDGE_HEIGHT = 3

/**
 * Dónde va la raya de habilitación y cuánto mide, en unidades de rejilla.
 *
 * El original la dibuja a x=18 px —una unidad— y de 28 px de largo (46-18), pegada al borde
 * que le toca. Es lo que une el pin de habilitación con el cuerpo del tri-estado.
 */
const ENABLE_X = 1
const ENABLE_LENGTH = 28 / 18

/**
 * El triángulo, con la punta a la derecha y a la altura del pin de salida.
 *
 * `width` es el ancho de la caja entera, no el de la cuña: el triángulo ocupa todo el ancho
 * porque la punta es donde el modelo pone el pin de salida.
 */
function wedge(width: number, height: number): Path2D {
  const size = Math.min(height, WEDGE_HEIGHT)
  const top = (height - size) / 2

  const path = new Path2D()
  path.moveTo(width, top + size / 2)
  path.lineTo(0, top)
  path.lineTo(0, top + size)
  path.closePath()
  return path
}

/** La raya que asoma por el borde y engancha el triángulo con el pin de habilitación. */
function enableLine(height: number, fromBottom: boolean): Path2D {
  const path = new Path2D()
  const outer = fromBottom ? height : 0
  const inner = fromBottom ? height - ENABLE_LENGTH : ENABLE_LENGTH

  path.moveTo(ENABLE_X, outer)
  path.lineTo(ENABLE_X, inner)
  return path
}

/** La silueta de una NOT: solo el triángulo. */
export function notShape(width: number, height: number): SymbolDrawing {
  return { body: wedge(width, height), bodyFill: 'symbol' }
}

/** La silueta de un tri-estado con la habilitación **abajo**. */
export function triState1Shape(width: number, height: number): SymbolDrawing {
  return {
    body: wedge(width, height),
    bodyFill: 'symbol',
    stroke: enableLine(height, true),
  }
}

/** La silueta de un tri-estado con la habilitación **arriba**. */
export function triState2Shape(width: number, height: number): SymbolDrawing {
  return {
    body: wedge(width, height),
    bodyFill: 'symbol',
    stroke: enableLine(height, false),
  }
}
