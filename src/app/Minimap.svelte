<script lang="ts">
  import { onMount } from 'svelte'
  import type { Editor } from './editor'
  import { deviceBounds } from '../core/model/layout'
  import { GRID_SIZE } from '../render/geometry'
  import { readTheme } from '../render/theme-bridge'

  let { editor }: { editor: Editor | null } = $props()
  let canvasEl = $state<HTMLCanvasElement | null>(null)

  /**
   * Redibuja el minimapa.
   *
   * Se llama cuando el editor avisa de un repintado (documento o cámara), no por un
   * temporizador: antes esto era un `setInterval` que además asignaba una variable de estado
   * inexistente (`revision`), lo que reventaba en cada tick.
   */
  const draw = (): void => {
    const canvas = canvasEl
    if (!canvas || !editor) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth || 120
    const cssH = canvas.clientHeight || 90
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const elements = editor.diagram.elements
    const resolveCircuit = (id: string) => editor?.project.circuit(id)
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const el of elements) {
      if (el.kind === 'wire') {
        minX = Math.min(minX, el.p1.x, el.p2.x)
        minY = Math.min(minY, el.p1.y, el.p2.y)
        maxX = Math.max(maxX, el.p1.x, el.p2.x)
        maxY = Math.max(maxY, el.p1.y, el.p2.y)
      } else {
        const box = deviceBounds(el, resolveCircuit)
        minX = Math.min(minX, box.x0)
        minY = Math.min(minY, box.y0)
        maxX = Math.max(maxX, box.x1)
        maxY = Math.max(maxY, box.y1)
      }
    }
    if (!isFinite(minX)) {
      minX = 0
      minY = 0
      maxX = 1
      maxY = 1
    }
    const pad = 1
    minX -= pad
    minY -= pad
    maxX += pad
    maxY += pad
    const grid = GRID_SIZE
    const scale = Math.min(cssW / ((maxX - minX) * grid), cssH / ((maxY - minY) * grid))
    const toX = (gx: number): number => (gx - minX) * grid * scale
    const toY = (gy: number): number => (gy - minY) * grid * scale

    // El minimapa también es del tema (M6-20): nada de grises y azules a pelo.
    const theme = readTheme()
    ctx.fillStyle = theme.wireIdle
    ctx.globalAlpha = 0.45
    for (const el of elements) {
      if (el.kind === 'wire') {
        ctx.strokeStyle = theme.wireIdle
        ctx.globalAlpha = 0.6
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(toX(el.p1.x), toY(el.p1.y))
        ctx.lineTo(toX(el.p2.x), toY(el.p2.y))
        ctx.stroke()
        ctx.globalAlpha = 0.45
      } else {
        const box = deviceBounds(el, resolveCircuit)
        ctx.fillRect(
          toX(box.x0),
          toY(box.y0),
          Math.max(1, (box.x1 - box.x0) * grid * scale),
          Math.max(1, (box.y1 - box.y0) * grid * scale),
        )
      }
    }
    ctx.globalAlpha = 1

    // Rectángulo del viewport, con el tamaño real del lienzo (antes estaba fijado a 800×600).
    const cam = editor.cameraState
    const view = editor.viewportSize
    const scale0 = grid * cam.zoom
    const vx0 = -cam.offsetX / scale0
    const vy0 = -cam.offsetY / scale0
    const vx1 = (view.width - cam.offsetX) / scale0
    const vy1 = (view.height - cam.offsetY) / scale0
    ctx.strokeStyle = theme.selection
    ctx.lineWidth = 1.5
    ctx.strokeRect(toX(vx0), toY(vy0), (vx1 - vx0) * grid * scale, (vy1 - vy0) * grid * scale)
  }

  onMount(() => {
    if (!editor) return
    const stop = editor.subscribeView(draw)
    draw()
    return stop
  })
</script>

<canvas bind:this={canvasEl} class="minimap" width="120" height="90"></canvas>

<style>
  .minimap {
    position: absolute;
    right: 0.6rem;
    bottom: 3.2rem;
    width: 120px;
    height: 90px;
    border: 1px solid var(--border);
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--panel-bg) 80%, transparent);
    z-index: 8;
    pointer-events: none;
  }

  @media (max-width: 1200px) {
    /* La barra de simulación pasa a dos filas: el minimapa sube para no montarse encima. */
    .minimap {
      bottom: 5.2rem;
    }
  }

  @media (max-width: 900px) {
    /* Con tres filas de controles ya no hay hueco: se oculta y queda el encuadre (F). */
    .minimap {
      display: none;
    }
  }
</style>
