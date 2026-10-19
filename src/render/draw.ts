/**
 * El dibujado de las piezas (M1-08).
 *
 * Todo lo de aquí asume que el contexto **ya viene transformado a unidades de rejilla**:
 * quien llama ha puesto `scale = GRID_SIZE · zoom` y el offset de la cámara. Así que
 * estas funciones escriben coordenadas del mundo y no saben nada de píxeles.
 *
 * De ahí sale una propiedad que conviene entender: los grosores se expresan en unidades
 * de rejilla, y **se escalan con el zoom**. Eso no es un descuido, es lo que hace el
 * original: su `StrokeThickness = 1` va dentro de un `LayoutTransform`, así que al
 * acercar también engorda. Si algún día queremos lo contrario, se cambia solo aquí.
 *
 * El bucle de `canvas2d.ts` pasa por estas funciones una vez por pieza y **sin crear
 * objetos** en el camino: las siluetas vienen de un caché (`symbols/index.ts`).
 */

import { GRID_SIZE } from './geometry'
import { rotationAngle, rotationCenter } from '../core/model/layout'
import { symbolDrawing } from './symbols'
import type {
  DeviceState,
  DrawDevice,
  DrawJunction,
  DrawPinDot,
  DrawWire,
  RenderTheme,
} from './ir-renderer'

/** Grosor de trazo, en píxeles con zoom 1. El original usa 1 px. */
const STROKE_PX = 1.5

/** El mismo grosor, pero en unidades de rejilla: así sirve con cualquier zoom. */
const STROKE = STROKE_PX / GRID_SIZE

/**
 * Radio del punto de un pin, en unidades de rejilla (original: `Symbol.PinRadius = 3`).
 *
 * El punto de unión usa el mismo radio, y no es casualidad: el original dibuja el *solder*
 * con `2 * Symbol.PinRadius` de diámetro, o sea el mismo tamaño que un pin.
 */
const PIN_DOT_RADIUS = 3 / GRID_SIZE

/** Cuánto crece un pin mientras se tiende un cable, para que se vea dónde acabar. */
const EMPHASIZED_PIN_SCALE = 1.7

/** Radio del halo del LED encendido, en píxeles de pantalla. */
const GLOW_PX = 6

/** El color que le toca a un estado. */
function stateColor(theme: RenderTheme, state: DeviceState): string {
  switch (state) {
    case 'off':
      return theme.stateOff
    case 'zero':
      return theme.stateZero
    case 'one':
      return theme.stateOne
  }
}

/** Dibuja un cable. En el original un cable es una `Line`: dos puntos y ya. */
export function drawWire(ctx: CanvasRenderingContext2D, wire: DrawWire, theme: RenderTheme): void {
  ctx.strokeStyle = wire.selected ? theme.selection : theme.wire
  ctx.lineWidth = STROKE

  ctx.beginPath()
  ctx.moveTo(wire.p1.x, wire.p1.y)
  ctx.lineTo(wire.p2.x, wire.p2.y)
  ctx.stroke()
}

/** Dibuja un símbolo con su transformación. */
export function drawDevice(
  ctx: CanvasRenderingContext2D,
  device: DrawDevice,
  theme: RenderTheme,
): void {
  const drawing = symbolDrawing(device.shape, device.width, device.height)
  const lit = device.state === 'one'

  ctx.save()
  ctx.translate(device.position.x, device.position.y)

  // Girar es rotar sobre el mismo centro que usa el original: si aquí se eligiera otro,
  // los pines se dibujarían donde no están.
  if (device.rotation !== 'up') {
    const center = rotationCenter(device.width, device.height)
    ctx.translate(center.x, center.y)
    ctx.rotate((rotationAngle(device.rotation) * Math.PI) / 180)
    ctx.translate(-center.x, -center.y)
  }

  ctx.lineWidth = STROKE
  ctx.strokeStyle = device.selected ? theme.selection : theme.symbolStroke

  // Un LED encendido suelta un halo. Es lo único del dibujado que cuesta dinero de más,
  // así que solo se paga cuando de verdad hay luz.
  if (lit && drawing.bodyFill === 'state') {
    ctx.shadowColor = theme.stateOne
    ctx.shadowBlur = GLOW_PX
  }

  ctx.fillStyle = drawing.bodyFill === 'state' ? stateColor(theme, device.state) : theme.symbolFill
  ctx.fill(drawing.body)
  ctx.stroke(drawing.body)

  if (lit && drawing.bodyFill === 'state') {
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
  }

  if (drawing.indicator !== undefined) {
    ctx.fillStyle = stateColor(theme, device.state)
    ctx.fill(drawing.indicator)
    ctx.stroke(drawing.indicator)
  }

  // Las rayas que no son borde del cuerpo (la onda del reloj, la raya de la XOR, la
  // habilitación del tri-estado): solo se perfilan, con el mismo color que el contorno.
  if (drawing.stroke !== undefined) {
    ctx.stroke(drawing.stroke)
  }

  ctx.restore()
}

/**
 * El punto donde se juntan tres o más cables.
 *
 * Va del color del cable, igual que en el original: allí `WireStroke` y `JamDirectFill` son
 * **el mismo pincel** (`Brushes.Black`), así que la unión no se distingue del cable por
 * color sino por ser un punto más grueso que el trazo.
 */
export function drawJunction(
  ctx: CanvasRenderingContext2D,
  junction: DrawJunction,
  theme: RenderTheme,
): void {
  ctx.beginPath()
  ctx.arc(junction.point.x, junction.point.y, PIN_DOT_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = theme.wire
  ctx.fill()
}

/** Dibuja el punto de un pin. */
export function drawPinDot(
  ctx: CanvasRenderingContext2D,
  dot: DrawPinDot,
  theme: RenderTheme,
): void {
  const radius = dot.emphasized === true ? PIN_DOT_RADIUS * EMPHASIZED_PIN_SCALE : PIN_DOT_RADIUS

  ctx.beginPath()
  ctx.arc(dot.point.x, dot.point.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = dot.connected ? theme.wire : theme.pinDot
  ctx.fill()
}
