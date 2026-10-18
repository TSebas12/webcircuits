<script lang="ts">
  import { onMount } from 'svelte'
  import { Canvas2DRenderer } from '../render/canvas2d'
  import { Camera } from '../render/camera'
  import type { RenderScene } from '../render/ir-renderer'
  import { readTheme, watchTheme } from '../render/theme-bridge'

  /** Márgenes de la vista inicial, en píxeles. Deja el origen del circuito a la vista. */
  const INITIAL_PADDING_X = 24
  const INITIAL_PADDING_Y = 80

  /** Sensibilidad de la rueda. Cuanto menor, más suave. */
  const WHEEL_SENSITIVITY = 0.0015

  let canvasEl = $state<HTMLCanvasElement | null>(null)
  let fps = $state(0)
  let paintMs = $state(0)
  let zoomPct = $state(100)
  let panning = $state(false)

  onMount(() => {
    const canvas = canvasEl
    if (canvas === null) {
      return
    }

    const camera = new Camera()
    const renderer = new Canvas2DRenderer()
    let theme = readTheme()

    const pushScene = (): void => {
      const scene: RenderScene = {
        camera: camera.state,
        theme,
        showGrid: true,
        items: [], // M1-08 empezará a llenarlo
      }
      renderer.render(scene)
      zoomPct = Math.round(camera.zoom * 100)
    }

    renderer.init(canvas, {
      onStats: (stats) => {
        fps = stats.fps
        paintMs = stats.paintMs
      },
    })

    camera.reset(INITIAL_PADDING_X, INITIAL_PADDING_Y)
    pushScene()

    // ── Arrastrar para desplazar ─────────────────────────────────────────
    let lastX = 0
    let lastY = 0

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return
      }
      panning = true
      lastX = event.clientX
      lastY = event.clientY
      canvas.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent): void => {
      if (!panning) {
        return
      }
      camera.panBy(event.clientX - lastX, event.clientY - lastY)
      lastX = event.clientX
      lastY = event.clientY
      pushScene()
    }

    const onPointerUp = (event: PointerEvent): void => {
      panning = false
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
    }

    // ── Rueda para acercar, anclada al cursor ────────────────────────────
    // Nota: las tablets y los portátiles envían `deltaMode` en líneas, no en píxeles.
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      const rect = canvas.getBoundingClientRect()
      camera.zoomAt(
        event.clientX - rect.left,
        event.clientY - rect.top,
        Math.exp(-delta * WHEEL_SENSITIVITY),
      )
      pushScene()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    // El color del lienzo se recalcula solo cuando cambia el tema, nunca por fotograma.
    const stopWatchingTheme = watchTheme(() => {
      theme = readTheme()
      pushScene()
    })

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      stopWatchingTheme()
      renderer.destroy()
    }
  })
</script>

<div class="diagram">
  <canvas bind:this={canvasEl} class:panning></canvas>

  <div class="hud" aria-hidden="true">
    <span>{fps.toFixed(0)} FPS</span>
    <span class="sep">·</span>
    <span>{paintMs.toFixed(2)} ms</span>
    <span class="sep">·</span>
    <span>{zoomPct} %</span>
  </div>
</div>

<style>
  .diagram {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
  }

  canvas.panning {
    cursor: grabbing;
  }

  .hud {
    position: absolute;
    right: 0.6rem;
    bottom: 0.6rem;
    display: flex;
    gap: 0.35rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--panel-bg) 85%, transparent);
    font: 0.72rem/1.6 var(--font-mono);
    color: var(--fg-muted);
    user-select: none;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }

  .sep {
    opacity: 0.5;
  }
</style>
