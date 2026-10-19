<script lang="ts">
  import { onMount } from 'svelte'
  import type { Piece } from './palette'
  import { pieceLayout } from './palette'
  import { shapeForGate } from '../render/symbols'
  import { symbolDrawing } from '../render/symbols'

  let { piece, inputs = 2 }: { piece: Piece; inputs?: number } = $props()

  let canvasEl = $state<HTMLCanvasElement | null>(null)

  onMount(() => {
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
    const count =
      piece.kind === 'gate'
        ? piece.inputCount === 'variable'
          ? inputs
          : piece.inputCount
        : 2
    const layout = pieceLayout(piece, count)
    const shape = piece.kind === 'button'
      ? 'button'
      : shapeForGate(piece.gateType, piece.invertedOutput)
    if (shape === null) return

    const drawing = symbolDrawing(shape as never, layout.width, layout.height)
    // Fit symbol into canvas with margin
    const margin = 2
    const scale = (size - margin * 2) / Math.max(layout.width, layout.height)
    const offX = (size - layout.width * scale) / 2
    const offY = (size - layout.height * scale) / 2

    const fill = getComputedStyle(document.documentElement).getPropertyValue('--wc-symbol-fill').trim() || '#ffffff'
    const stroke = getComputedStyle(document.documentElement).getPropertyValue('--wc-symbol-stroke').trim() || '#22252b'

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
    ctx.restore()
  })
</script>

<canvas bind:this={canvasEl} class="piece-preview" aria-hidden="true"></canvas>

<style>
  .piece-preview {
    display: inline-block;
    vertical-align: middle;
  }
</style>