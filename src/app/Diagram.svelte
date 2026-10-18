<script lang="ts">
  import { onMount } from 'svelte'
  import { Editor, type Tool } from './editor'

  /** Los botones de la paleta. Se colocan con un clic en el lienzo. */
  const TOOLS: readonly { readonly id: Tool; readonly glyph: string; readonly title: string }[] = [
    { id: 'select', glyph: '⌖', title: 'Seleccionar y mover (Esc)' },
    { id: 'button', glyph: '⏻', title: 'Interruptor de entrada' },
    { id: 'and', glyph: '∧', title: 'Compuerta AND' },
    { id: 'led', glyph: '◉', title: 'LED' },
  ]

  let canvasEl = $state<HTMLCanvasElement | null>(null)
  let tool = $state<Tool>('select')
  let powered = $state(true)
  let hasSelection = $state(false)

  let fps = $state(0)
  let paintMs = $state(0)
  let zoomPct = $state(100)

  /**
   * El editor se crea en `onMount`, así que antes de eso no existe. No es `$state` a
   * propósito: no hay nada que redibujar cuando cambia, solo hay que poder llamarlo.
   */
  let editor: Editor | null = null

  onMount(() => {
    const canvas = canvasEl
    if (canvas === null) {
      return
    }

    const instance = new Editor({
      onStats: (stats) => {
        fps = stats.fps
        paintMs = stats.paintMs
      },
      onZoom: (percent) => {
        zoomPct = percent
      },
      onSelectionChange: (id) => {
        hasSelection = id !== null
      },
      onPoweredChange: (value) => {
        powered = value
      },
    })
    editor = instance
    instance.mount(canvas)

    return () => {
      instance.unmount()
      editor = null
    }
  })

  const chooseTool = (id: Tool): void => {
    tool = id
    editor?.setTool(id)
  }

  const togglePower = (): void => {
    powered = !powered
    editor?.setPowered(powered)
  }

  const clearAll = (): void => {
    editor?.clear()
  }

  const loadExample = (): void => {
    editor?.loadExample()
  }

  const removeSelected = (): void => {
    editor?.removeSelected()
  }
</script>

<div class="diagram">
  <canvas bind:this={canvasEl} class:placing={tool !== 'select'}></canvas>

  <div class="toolbar" role="toolbar" aria-label="Herramientas del circuito">
    {#each TOOLS as item (item.id)}
      <button
        type="button"
        class="tool"
        class:active={tool === item.id}
        title={item.title}
        aria-pressed={tool === item.id}
        onclick={() => chooseTool(item.id)}
      >
        {item.glyph}
      </button>
    {/each}

    <span class="divider"></span>

    <button type="button" onclick={loadExample} title="Coloca el circuito de ejemplo">
      Ejemplo
    </button>
    <button
      type="button"
      onclick={removeSelected}
      disabled={!hasSelection}
      title="Borra lo seleccionado (Supr)"
    >
      Borrar
    </button>
    <button type="button" onclick={clearAll} title="Vacía el circuito">Vaciar</button>

    <span class="divider"></span>

    <button
      type="button"
      class="power"
      class:on={powered}
      onclick={togglePower}
      title="Enciende o apaga el circuito (en el original, Circuito → Encender)"
      aria-pressed={powered}
    >
      {powered ? '⚡ Encendido' : '⏻ Apagado'}
    </button>
  </div>

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

  canvas.placing {
    cursor: crosshair;
  }

  /* ── Paleta ─────────────────────────────────────────────────────────── */

  .toolbar {
    position: absolute;
    top: 0.6rem;
    left: 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem;
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    backdrop-filter: blur(6px);
    box-shadow: 0 4px 14px rgb(0 0 0 / 8%);
  }

  .toolbar button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    height: 2rem;
    padding: 0 0.6rem;
    border: 1px solid transparent;
    border-radius: 0.4rem;
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      background-color 100ms ease,
      border-color 100ms ease;
  }

  .toolbar button:hover:not(:disabled) {
    background: var(--panel-bg-hover);
  }

  .toolbar .tool {
    font-size: 1.05rem;
  }

  .toolbar .tool.active {
    border-color: var(--wc-selection);
    background: color-mix(in srgb, var(--wc-selection) 16%, transparent);
  }

  .toolbar button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .toolbar button:focus-visible {
    outline: 2px solid var(--wc-selection);
    outline-offset: 1px;
  }

  .divider {
    width: 1px;
    height: 1.4rem;
    margin: 0 0.2rem;
    background: var(--border);
  }

  .power.on {
    color: var(--wc-state-one);
  }

  /* ── Medidas ────────────────────────────────────────────────────────── */

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
