<script lang="ts">
  import { onMount } from 'svelte'
  import type { OscilloscopeChannel } from './oscilloscope-draw'
  import { drawOscilloscope } from './oscilloscope-draw'

  let {
    channels = [],
    height = 220,
  }: {
    channels?: readonly OscilloscopeChannel[]
    height?: number
  } = $props()

  let canvasEl = $state<HTMLCanvasElement | null>(null)

  function readColors(): {
    background: string
    grid: string
    text: string
    channels: string[]
  } {
    const styles = getComputedStyle(document.documentElement)
    const vars = [
      '--wc-wire-high',
      '--wc-wire-low',
      '--wc-selection',
      '--wc-hover',
      '--wc-pin-dot',
      '--wc-handle',
      '--wc-wire-bus',
      '--wc-accent',
    ]
    const channels = vars
      .map((name) => styles.getPropertyValue(name).trim())
      .filter((value) => value.length > 0)
    return {
      background: styles.getPropertyValue('--wc-diagram-bg').trim() || '#10131a',
      grid: styles.getPropertyValue('--wc-grid-dot').trim() || '#2a2f3a',
      text: styles.getPropertyValue('--wc-gate-text').trim() || '#e6e8ec',
      channels: channels.length > 0 ? channels : ['#8a93a6'],
    }
  }

  function draw(): void {
    const canvas = canvasEl
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return

    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, canvas.clientWidth || 320)
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    drawOscilloscope(ctx, width, height, channels, readColors())
  }

  onMount(() => {
    draw()
  })

  $effect(() => {
    void channels
    void height
    draw()
  })
</script>

<canvas bind:this={canvasEl} class="oscilloscope" aria-label="Osciloscopio"></canvas>

<style>
  .oscilloscope {
    display: block;
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--wc-diagram-bg, #10131a);
  }
</style>