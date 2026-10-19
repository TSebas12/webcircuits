import { rotatePoint } from '../core/model/layout'
import type { CameraState } from './camera'
import { GRID_SIZE } from './geometry'
import type { DrawItem } from './ir-renderer'

/**
 * Culling de viewport (M2-16).
 *
 * Devuelve solo los items cuya caja delimitadora intersecta la zona visible.
 * Se aplica **antes** de pintar, para que un circuito de 5.000 compuertas
 * con zoom alejado no pinte las 5.000.
 */

export interface Box {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/**
 * La caja de un símbolo, teniendo en cuenta el giro.
 *
 * Un símbolo girado 180° se sale a coordenadas negativas respecto de su esquina, así que
 * quedarse con `(0,0)-(ancho,alto)` recortaría la pieza. Se gira cada esquina con la misma
 * regla que los pines (`core/model/layout.rotatePoint`) y se toma lo que las contiene.
 */
function deviceBox(item: Extract<DrawItem, { kind: 'device' }>): Box {
  if (item.rotation === 'up') {
    return {
      x0: item.position.x,
      y0: item.position.y,
      x1: item.position.x + item.width,
      y1: item.position.y + item.height,
    }
  }

  const corners = [
    { x: 0, y: 0 },
    { x: item.width, y: 0 },
    { x: item.width, y: item.height },
    { x: 0, y: item.height },
  ]
  let x0 = Number.POSITIVE_INFINITY
  let y0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY
  for (const corner of corners) {
    const turned = rotatePoint(corner, item.rotation, item.width, item.height)
    if (turned.x < x0) x0 = turned.x
    if (turned.y < y0) y0 = turned.y
    if (turned.x > x1) x1 = turned.x
    if (turned.y > y1) y1 = turned.y
  }
  return {
    x0: item.position.x + x0,
    y0: item.position.y + y0,
    x1: item.position.x + x1,
    y1: item.position.y + y1,
  }
}

/** La caja que ocupa una pieza, en unidades de rejilla. */
export function itemBox(item: DrawItem): Box | null {
  switch (item.kind) {
    case 'device':
      return deviceBox(item)
    case 'wire':
      return {
        x0: Math.min(item.p1.x, item.p2.x),
        y0: Math.min(item.p1.y, item.p2.y),
        x1: Math.max(item.p1.x, item.p2.x),
        y1: Math.max(item.p1.y, item.p2.y),
      }
    case 'junction':
      return { x0: item.point.x, y0: item.point.y, x1: item.point.x, y1: item.point.y }
    case 'pinDot':
      return { x0: item.point.x, y0: item.point.y, x1: item.point.x, y1: item.point.y }
  }
}

/**
 * Filtra los items que intersectan el viewport.
 *
 * `cssWidth`/`cssHeight` son las dimensiones del canvas en CSS (píxeles).
 */
export function cullItems(
  items: readonly DrawItem[],
  camera: CameraState,
  cssWidth: number,
  cssHeight: number,
): DrawItem[] {
  if (cssWidth < 10 || cssHeight < 10 || camera.zoom <= 0) {
    return [...items]
  }
  const scale = GRID_SIZE * camera.zoom
  // Viewport en unidades de rejilla.
  const left = (0 - camera.offsetX) / scale
  const top = (0 - camera.offsetY) / scale
  const right = (cssWidth - camera.offsetX) / scale
  const bottom = (cssHeight - camera.offsetY) / scale

  // Margen generoso: al menos 1 celda y ~6 px en pantalla, para no cortar
  // trazos/halos en los bordes con zoom alejado.
  const margin = Math.max(1, 6 / (GRID_SIZE * camera.zoom))
  const vx0 = left - margin
  const vy0 = top - margin
  const vx1 = right + margin
  const vy1 = bottom + margin

  const result: DrawItem[] = []
  for (const item of items) {
    const box = itemBox(item)
    if (box === null) {
      result.push(item)
      continue
    }
    if (box.x1 < vx0 || box.x0 > vx1 || box.y1 < vy0 || box.y0 > vy1) {
      continue
    }
    result.push(item)
  }
  return result
}
