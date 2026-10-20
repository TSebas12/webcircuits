<script lang="ts">
  import { onMount } from 'svelte'
  import type { Piece } from './palette'
  import { pieceLayout, pieceShape } from './palette'
  import { symbolDrawing } from '../render/symbols'
  import { LIGHT_THEME } from '../core/theme/presets'

  let { piece }: { piece: Piece } = $props()

  let canvasEl = $state<HTMLCanvasElement | null>(null)

  function draw(): void {
    const canvas = canvasEl
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return

    const dpr = window.devicePixelRatio || 1
    const size = 28
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)

    // Layout + shape
    // La preview no refleja el número de entradas elegido: siempre muestra 2,
    // para que la paleta no "baile" al cambiar el selector de entradas.
    const count =
      piece.kind === 'gate'
        ? piece.inputCount === 'variable'
          ? 2
          : piece.inputCount
        : 2
    const layout = pieceLayout(piece, count)
    const shape = pieceShape(piece)
    if (shape === null) return

    const drawing = symbolDrawing(shape, layout.width, layout.height)
    // Fit symbol into canvas with margin
    const margin = 2
    const scale = (size - margin * 2) / Math.max(layout.width, layout.height)
    const offX = (size - layout.width * scale) / 2
    const offY = (size - layout.height * scale) / 2

    const styles = getComputedStyle(document.documentElement)
    const fill = styles.getPropertyValue('--wc-symbol-fill').trim() || LIGHT_THEME.tokens['gate.fill']
    const stroke = styles.getPropertyValue('--wc-symbol-stroke').trim() || LIGHT_THEME.tokens['gate.stroke']

    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.translate(offX, offY)
    ctx.scale(scale, scale)
    ctx.lineWidth = 1 / scale
    ctx.strokeStyle = stroke
    ctx.fillStyle = fill
    ctx.fill(drawing.body)
    ctx.stroke(drawing.body)
    if (drawing.stroke !== undefined) ctx.stroke(drawing.stroke)
    if (drawing.bubble !== undefined) {
      ctx.fillStyle = fill
      ctx.fill(drawing.bubble)
      ctx.stroke(drawing.bubble)
    }
    if (drawing.indicator !== undefined) {
      ctx.fillStyle = stroke
      ctx.fill(drawing.indicator)
    }
    if (piece.kind === 'constant') {
      ctx.fillStyle = stroke
      ctx.font = `600 ${Math.min(0.7, Math.min(layout.width, layout.height) * 0.32)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(piece.value), layout.width / 2, layout.height / 2, layout.width - 0.45)
    }
    ctx.restore()
  }

  onMount(() => {
    draw()
  })

  $effect(() => {
    // Redibuja al cambiar la pieza o el tema.
    void piece
    draw()
  })
</script>

<canvas bind:this={canvasEl} class="piece-preview" aria-hidden="true"></canvas>

<style>
  .piece-preview {
    display: inline-block;
    vertical-align: middle;
  }
</style>