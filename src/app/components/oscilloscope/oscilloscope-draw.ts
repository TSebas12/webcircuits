/**
 * Dibujo del osciloscopio (M7-02).
 *
 * Es **puro**: recibe un contexto 2D ya escalado a píxeles CSS y devuelve el lienzo pintado.
 * Así se puede probar sin montar Svelte y la componente solo se encarga del tamaño y del tema.
 */
export interface OscilloscopeChannel {
  readonly label: string
  readonly samples: readonly number[]
}

export interface OscilloscopeColors {
  readonly background: string
  readonly grid: string
  readonly text: string
  readonly channels: readonly string[]
}

const LEFT_MARGIN = 72
const TOP_MARGIN = 12
const BOTTOM_MARGIN = 12
const RIGHT_MARGIN = 8

export function drawOscilloscope(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  channels: readonly OscilloscopeChannel[],
  colors: OscilloscopeColors,
): void {
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)

  const plotLeft = LEFT_MARGIN
  const plotTop = TOP_MARGIN
  const plotWidth = Math.max(1, width - LEFT_MARGIN - RIGHT_MARGIN)
  const plotHeight = Math.max(1, height - TOP_MARGIN - BOTTOM_MARGIN)

  if (channels.length === 0) {
    ctx.fillStyle = colors.text
    ctx.font = '12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Sin señales', plotLeft + plotWidth / 2, plotTop + plotHeight / 2)
    return
  }

  const bandHeight = plotHeight / channels.length

  // Separadores horizontales entre canales.
  ctx.strokeStyle = colors.grid
  ctx.lineWidth = 1
  for (let i = 0; i <= channels.length; i++) {
    const y = plotTop + i * bandHeight
    ctx.beginPath()
    ctx.moveTo(plotLeft, y)
    ctx.lineTo(plotLeft + plotWidth, y)
    ctx.stroke()
  }

  channels.forEach((channel, index) => {
    const bandTop = plotTop + index * bandHeight
    const bandBottom = bandTop + bandHeight
    const highY = bandTop + bandHeight * 0.18
    const lowY = bandBottom - bandHeight * 0.18
    const color = colors.channels[index % colors.channels.length] ?? colors.text

    // Etiqueta del canal.
    ctx.fillStyle = colors.text
    ctx.font = '11px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(channel.label, LEFT_MARGIN - 6, (highY + lowY) / 2)

    const samples = channel.samples
    if (samples.length === 0) {
      return
    }

    const stepX = samples.length > 1 ? plotWidth / (samples.length - 1) : plotWidth
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    let previousY = (samples[0] ?? 0) >= 0.5 ? highY : lowY
    ctx.moveTo(plotLeft, previousY)
    for (let i = 1; i < samples.length; i++) {
      const x = plotLeft + i * stepX
      const y = (samples[i] ?? 0) >= 0.5 ? highY : lowY
      if (y !== previousY) {
        ctx.lineTo(x, previousY)
        ctx.lineTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
      previousY = y
    }
    // Último tramo hasta el borde derecho.
    const lastX = plotLeft + (samples.length - 1) * stepX
    ctx.lineTo(Math.min(plotLeft + plotWidth, lastX + stepX), previousY)
    ctx.stroke()
  })
}