<script lang="ts">
  import type { Editor } from './editor'
  let { editor }: { editor: Editor | null } = $props()
  let canvasEl = $state<HTMLCanvasElement | null>(null)
  // revision tracked implicitly

  const draw = () => {
    const canvas = canvasEl
    if (!canvas || !editor) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    ctx.fillStyle = 'rgba(120,120,120,0.4)'

    const elements = editor.diagram.elements as { kind: string; position?: { x: number; y: number }; p1?: { x: number; y: number }; p2?: { x: number; y: number } }[]
    // bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const el of elements) {
      if (el.kind === 'wire') {
        minX = Math.min(minX, el.p1!.x, el.p2!.x)
        minY = Math.min(minY, el.p1!.y, el.p2!.y)
        maxX = Math.max(maxX, el.p1!.x, el.p2!.x)
        maxY = Math.max(maxY, el.p1!.y, el.p2!.y)
      } else if (el.position) {
        minX = Math.min(minX, el.position.x)
        minY = Math.min(minY, el.position.y)
        maxX = Math.max(maxX, el.position.x + 2)
        maxY = Math.max(maxY, el.position.y + 2)
      }
    }
    if (!isFinite(minX)) return
    const pad = 1
    minX -= pad; minY -= pad; maxX += pad; maxY += pad
    const scaleX = cssW / ((maxX - minX) * 18)
    const scaleY = cssH / ((maxY - minY) * 18)
    const scale = Math.min(scaleX, scaleY)

    const toX = (gx: number) => (gx - minX) * 18 * scale
    const toY = (gy: number) => (gy - minY) * 18 * scale

    // draw elements
    for (const el of elements) {
      if (el.kind === 'wire') {
        ctx.strokeStyle = 'rgba(120,120,120,0.6)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(toX(el.p1!.x), toY(el.p1!.y))
        ctx.lineTo(toX(el.p2!.x), toY(el.p2!.y))
        ctx.stroke()
      } else if (el.position) {
        ctx.fillRect(toX(el.position.x), toY(el.position.y), 2 * 18 * scale, 2 * 18 * scale)
      }
    }

    // viewport rect
    const cam = editor.cameraState
    const cssW2 = 800
    const cssH2 = 600
    const scale0 = 18 * cam.zoom
    const vx0 = (-cam.offsetX) / scale0
    const vy0 = (-cam.offsetY) / scale0
    const vx1 = (cssW2 - cam.offsetX) / scale0
    const vy1 = (cssH2 - cam.offsetY) / scale0
    ctx.strokeStyle = 'rgba(60,120,220,0.8)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(toX(vx0), toY(vy0), (vx1 - vx0) * 18 * scale, (vy1 - vy0) * 18 * scale)
  }

  // redraw periodically
  import { onMount } from 'svelte'
  onMount(() => {
    const t = setInterval(() => {
      revision = editor?.diagram?.revision ?? 0
      draw()
    }, 500)
    draw()
    return () => clearInterval(t)
  })
</script>

<canvas bind:this={canvasEl} class="minimap" width="120" height="90"></canvas>

<style>
  .minimap {
    position: absolute;
    right: 0.6rem;
    bottom: 2.2rem;
    width: 120px;
    height: 90px;
    border: 1px solid var(--border);
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--panel-bg) 80%, transparent);
    z-index: 8;
    pointer-events: none;
  }
</style>