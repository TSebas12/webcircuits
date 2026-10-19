/**
 * Las siluetas del escudo: OR y XOR (M2-27).
 *
 * Traducidas de `SymbolShapes/ShapedOr.xaml` y `ShapedXor.xaml`. Las dos son el mismo escudo
 * —arriba y abajo curvos hasta una punta, en medio, y la espalda entrando hacia dentro—; la
 * XOR lleva **además** una raya curva a la izquierda, separada del cuerpo, que es lo que la
 * distingue a simple vista.
 *
 * El original dibuja la parte curva de tamaño fijo y estira el cuerpo con dos rayitas cuando
 * hay más de tres entradas. Aquí, como en la AND, el escudo se calcula directo para cubrir el
 * alto de la caja: mismo dibujo, menos piezas que sincronizar (ver la nota de `and.ts`).
 */

import type { SymbolDrawing } from './index'

/** Hasta dónde llegan las curvas de arriba y de abajo antes de ir a la punta (0..1 del ancho). */
const SHOULDER = 0.55

/** Cuánto entra la espalda hacia dentro, en la OR (0..1 del ancho). */
const OR_BACK = 0.3

/**
 * Lo mismo para la XOR, que lleva el cuerpo **retranqueado**: el original separa la espalda
 * del cuerpo 4 px de 54 y dibuja la raya suelta por delante.
 */
const XOR_BACK = 0.093
const XOR_BACK_CONTROL = 0.38
const XOR_LINE = 0.16

/** Un escudo: de `backX` hacia la punta, con la espalda entrando hasta `backControl`. */
function shield(width: number, height: number, backX: number, backControl: number): Path2D {
  const midY = height / 2
  const shoulder = width * SHOULDER
  const path = new Path2D()

  path.moveTo(backX, 0)
  path.quadraticCurveTo(shoulder, 0, width, midY)
  path.quadraticCurveTo(shoulder, height, backX, height)
  path.quadraticCurveTo(backControl, midY, backX, 0)
  path.closePath()
  return path
}

/** La silueta de una OR. */
export function orShape(width: number, height: number): SymbolDrawing {
  return {
    body: shield(width, height, 0, width * OR_BACK),
    bodyFill: 'symbol',
  }
}

/** La silueta de una XOR: el escudo retranqueado y la raya suelta que la delata. */
export function xorShape(width: number, height: number): SymbolDrawing {
  const extra = new Path2D()
  extra.moveTo(0, 0)
  extra.quadraticCurveTo(width * XOR_LINE, height / 2, 0, height)

  return {
    body: shield(width, height, width * XOR_BACK, width * XOR_BACK_CONTROL),
    bodyFill: 'symbol',
    stroke: extra,
  }
}
