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
  DrawLabel,
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
// En unidades de rejilla (≈ 6 px a zoom 1): el halo se escala con el zoom, como el resto del trazo.
const GLOW_PX = 6 / 18

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

/** Grosor extra de un bus, respecto a un cable simple (M6-15). */
const BUS_WIDTH_FACTOR = 2.5

/** Trazo discontinuo, en unidades de rejilla. Marca los cables flotantes sin depender del color. */
const FLOATING_DASH: readonly number[] = [0.28, 0.22]

/** El color y el trazo que le tocan a un cable (M6-03/M6-14/M6-15). */
function wireAppearance(theme: RenderTheme, wire: DrawWire): { color: string; dash: readonly number[] } {
  // El orden manda: la selección se ve siempre; el color forzado a mano gana al estado; y el
  // bus se distingue del cable simple aunque esté a 0 o a 1.
  if (wire.selected) {
    return { color: theme.wireSelected, dash: [] }
  }
  if (wire.hovered === true) {
    return { color: theme.hover, dash: [] }
  }
  if (wire.color !== undefined) {
    return { color: wire.color, dash: [] }
  }
  if (wire.bus) {
    return { color: theme.wireBus, dash: [] }
  }
  switch (wire.signal) {
    case 'high':
      return { color: theme.wireHigh, dash: [] }
    case 'low':
      return { color: theme.wireLow, dash: [] }
    case 'floating':
      return { color: theme.wireFloating, dash: FLOATING_DASH }
    case 'idle':
      return { color: theme.wireIdle, dash: [] }
  }
}

/** Dibuja un cable. En el original un cable es una `Line`: dos puntos y ya. */
export function drawWire(ctx: CanvasRenderingContext2D, wire: DrawWire, theme: RenderTheme): void {
  const { color, dash } = wireAppearance(theme, wire)
  ctx.strokeStyle = color
  ctx.lineWidth = STROKE * (wire.bus ? BUS_WIDTH_FACTOR : 1)
  ctx.setLineDash(dash as number[])

  ctx.beginPath()
  ctx.moveTo(wire.p1.x, wire.p1.y)
  ctx.lineTo(wire.p2.x, wire.p2.y)
  ctx.stroke()

  ctx.setLineDash([])

  // Tiradores en las puntas de un cable seleccionado (M6-06): dicen que se pueden arrastrar.
  if (wire.selected) {
    const size = 0.16
    ctx.fillStyle = theme.handle
    for (const point of [wire.p1, wire.p2]) {
      ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size)
    }
  }
}

/**
 * Pinta una etiqueta libre con una caja de fondo.
 *
 * El fondo usa el color del lienzo para que el texto se lea también encima de la rejilla, y
 * el borde el color del bus. La caja se calcula aquí, así que el anclaje se comporta como
 * el de `fillText`.
 */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  label: DrawLabel,
  theme: RenderTheme,
): void {
  const text = label.text
  if (text === '') {
    return
  }

  const size = label.size
  const paddingX = size * 0.38
  const paddingY = size * 0.2
  ctx.font = `600 ${size}px system-ui, sans-serif`
  const measured =
    typeof ctx.measureText === 'function' ? ctx.measureText(text).width : text.length * size * 0.62
  const width = Math.max(size, measured) + paddingX * 2
  const height = size + paddingY * 2

  let x = label.position.x
  if (label.align === 'center') {
    x -= width / 2
  } else if (label.align === 'right') {
    x -= width
  }

  let y = label.position.y
  if (label.baseline === 'middle') {
    y -= height / 2
  } else if (label.baseline === 'bottom') {
    y -= height
  }

  roundedRectPath(ctx, x, y, width, height, Math.min(height / 2, size * 0.35))
  ctx.fillStyle = theme.background
  ctx.fill()
  ctx.strokeStyle = label.selected === true ? theme.selection : theme.wireBus
  ctx.lineWidth = Math.max(0.04, size * 0.1)
  ctx.stroke()

  ctx.fillStyle = theme.gateText
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + paddingX, y + height / 2)
}

/** Contorno redondeado sin depender de `CanvasRenderingContext2D.roundRect`. */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
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
  ctx.strokeStyle = device.selected
    ? theme.selection
    : device.hovered === true
      ? theme.hover
      : theme.symbolStroke

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

  // Un display de 7 segmentos: cada segmento se enciende con su propia entrada. El estado
  // que no llega (corriente apagada, segmento sin cablear) se pinta apagado, no invisible.
  if (drawing.segments !== undefined) {
    ctx.lineCap = 'round'
    ctx.lineWidth = drawing.segmentWidth ?? STROKE
    drawing.segments.forEach((segment, index) => {
      const segmentLit = device.segmentStates?.[index] === 'one'
      if (segmentLit) {
        ctx.shadowColor = theme.stateOne
        ctx.shadowBlur = GLOW_PX
      }
      ctx.strokeStyle = segmentLit ? theme.stateOne : theme.stateOff
      ctx.stroke(segment)
      if (segmentLit) {
        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'
      }
    })
    ctx.lineCap = 'butt'
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

  // La bolita de negación, la última y tapando la punta: es como la pinta el original, que la
  // dibuja encima de la salida del símbolo.
  if (drawing.bubble !== undefined) {
    ctx.fillStyle = theme.symbolFill
    ctx.fill(drawing.bubble)
    ctx.stroke(drawing.bubble)
  }

  // Etiqueta del símbolo: el nombre de un pin o de un subcircuito, o el valor de una
  // constante. Va dentro de la transformación para que gire con el símbolo, como el texto
  // del original. El tamaño se limita al lado menor para que no se salga de la caja.
  if (device.label !== undefined && device.label !== '') {
    drawSymbolLabel(ctx, device, theme)
  }

  ctx.restore()
}

/** Pinta la etiqueta centrada de un símbolo. */
function drawSymbolLabel(
  ctx: CanvasRenderingContext2D,
  device: DrawDevice,
  theme: RenderTheme,
): void {
  // Un subcircuito lleva los pines justo en el borde, así que su etiqueta necesita más aire
  // que la de un pin o una constante; si no, el texto se monta encima de los puntos.
  const circuit = device.shape === 'circuit'
  const size = circuit
    ? Math.min(0.62, Math.min(device.width, device.height) * 0.3)
    : Math.min(0.7, Math.min(device.width, device.height) * 0.32)
  const maxWidth = Math.max(0.2, device.width - (circuit ? 1 : 0.45))
  const text = device.label ?? ''
  ctx.fillStyle = theme.gateText
  ctx.font = `600 ${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Los nombres de pines y subcircuitos pueden llevar espacios («Sumador de 4 bits»). En una
  // caja de 3 unidades, una sola línea quedaría comprimida hasta ser ilegible, así que se
  // parte en como mucho dos líneas. Los valores de constante van siempre en una.
  const lines = wrapsLabel(device) ? wrapText(ctx, text, maxWidth, size) : [text]
  const lineHeight = size * 1.15
  const startY = device.height / 2 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, index) => {
    ctx.fillText(line, device.width / 2, startY + index * lineHeight, maxWidth)
  })
}

/** ¿Merece la pena partir esta etiqueta en varias líneas? */
function wrapsLabel(device: DrawDevice): boolean {
  return device.shape === 'circuit' || device.shape === 'pinInput' || device.shape === 'pinOutput'
}

/** Parte un texto en dos líneas como mucho, midiendo con la fuente ya puesta. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
): string[] {
  const words = text.split(/\s+/).filter((word) => word !== '')
  if (words.length <= 1) {
    return [text]
  }

  const measure = (value: string): number =>
    typeof ctx.measureText === 'function' ? ctx.measureText(value).width : value.length * size * 0.55

  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (line !== '' && measure(candidate) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line !== '') {
    lines.push(line)
  }

  // Más de dos líneas no caben en un símbolo de este tamaño: lo que sobre se junta en la
  // segunda y `fillText` lo comprime. Es preferible a que el texto se salga de la caja.
  if (lines.length > 2) {
    return [lines[0]!, lines.slice(1).join(' ')]
  }
  return lines
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
  ctx.fillStyle = theme.wireIdle
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
  ctx.fillStyle = dot.connected ? theme.wireIdle : theme.pinDot
  ctx.fill()
}
