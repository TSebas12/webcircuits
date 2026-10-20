<script lang="ts">
  import Oscilloscope from './Oscilloscope.svelte'
  import type { OscilloscopeChannel } from './oscilloscope-draw'
  import { visibleWindow, zoomIn, zoomOut } from './oscilloscope-view'

  let {
    channels = [],
    onclear,
  }: {
    channels?: readonly OscilloscopeChannel[]
    onclear?: () => void
  } = $props()

  let paused = $state(false)
  let zoom = $state(1)

  const visibleChannels = $derived(
    channels.map((channel) => ({
      label: channel.label,
      samples: visibleWindow(channel.samples, zoom),
    })),
  )

  function togglePause(): void {
    paused = !paused
  }

  function handleClear(): void {
    onclear?.()
  }
</script>

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

<style>
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