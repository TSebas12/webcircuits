<script lang="ts">
  import Oscilloscope from './Oscilloscope.svelte'
  import Icon from '../../Icon.svelte'
  import type { OscilloscopeChannel } from './oscilloscope-draw'
  import { visibleWindow, zoomIn, zoomOut } from './oscilloscope-view'

  let {
    channels = [],
    onclear,
    onClose,
  }: {
    channels?: readonly OscilloscopeChannel[]
    onclear?: () => void
    onClose?: () => void
  } = $props()

  let paused = $state(false)
  let zoom = $state(1)
  /** Copia congelada mientras está en pausa; `null` significa «ver la señal en vivo». */
  let frozen = $state<readonly OscilloscopeChannel[] | null>(null)

  const source = $derived(frozen ?? channels)
  const visibleChannels = $derived(
    source.map((channel) => ({
      label: channel.label,
      samples: visibleWindow(channel.samples, zoom),
    })),
  )

  function togglePause(): void {
    if (paused) {
      frozen = null
    } else {
      // Congelar de verdad: si solo cambiara la etiqueta, las muestras seguirían entrando.
      frozen = channels.map((channel) => ({
        label: channel.label,
        samples: [...channel.samples],
      }))
    }
    paused = !paused
  }

  function handleClear(): void {
    if (paused) {
      frozen = []
    }
    onclear?.()
  }

  function handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose?.()
    }
  }
</script>

<svelte:window onkeydown={handleKey} />

<div
  class="scope-root"
  class:modal={onClose !== undefined}
  role={onClose !== undefined ? 'presentation' : undefined}
  onclick={onClose}
  onkeydown={(event) => event.stopPropagation()}
>
  <div
    class="scope-card"
    role={onClose !== undefined ? 'dialog' : undefined}
    aria-modal={onClose !== undefined ? 'true' : undefined}
    aria-label={onClose !== undefined ? 'Osciloscopio' : undefined}
    onclick={(event) => event.stopPropagation()}
  >
    {#if onClose !== undefined}
      <header>
        <h2>Osciloscopio</h2>
        <button type="button" class="close" onclick={onClose} aria-label="Cerrar" title="Cerrar"><Icon name="close" size={16} /></button>
      </header>
    {/if}

    <div class="oscilloscope-panel">
      <div class="controls" role="toolbar" aria-label="Controles del osciloscopio">
        <button type="button" onclick={togglePause}>{paused ? 'Reanudar' : 'Pausar'}</button>
        <button type="button" onclick={() => (zoom = zoomIn(zoom))}>Zoom +</button>
        <button type="button" onclick={() => (zoom = zoomOut(zoom))}>Zoom −</button>
        <button type="button" onclick={() => (zoom = 1)}>1:1</button>
        <button type="button" onclick={handleClear}>Limpiar</button>
        <span class="zoom-label">zoom {zoom.toFixed(2)}×</span>
      </div>
      <Oscilloscope channels={visibleChannels} height={220} />
    </div>
  </div>
</div>

<style>
  .scope-root {
    display: contents;
  }
  .scope-root.modal {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 45%);
  }
  .scope-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .scope-root.modal .scope-card {
    width: min(58rem, calc(100vw - 2rem));
    padding: 1rem 1.1rem;
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    background: var(--panel-bg);
    box-shadow: 0 10px 30px rgb(0 0 0 / 25%);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  .close {
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    font: inherit;
    font-size: 1rem;
    line-height: 1.2;
  }
  .close:hover {
    background: var(--panel-bg-hover);
  }
  .oscilloscope-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
  }
  .controls button {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 0.35rem;
    background: var(--panel-bg);
    color: var(--fg);
    cursor: pointer;
  }
  .controls button:hover {
    background: var(--panel-bg-hover);
  }
  .zoom-label {
    font-size: 0.8rem;
    color: var(--fg-muted);
    margin-left: 0.25rem;
  }
</style>
