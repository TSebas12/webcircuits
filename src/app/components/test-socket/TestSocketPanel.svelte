<script lang="ts">
  import type { StoredElement } from '../../core/model/types'
  import { createTestSockets } from '../../core/model/test-socket'

  let { elements = [] }: { elements?: readonly StoredElement[] } = $props()

  const sockets = $derived(createTestSockets(elements))
</script>

<aside class="test-sockets" aria-label="Sockets de test">
  <h3>Sockets de test</h3>
  {#if sockets === null}
    <p class="empty">El circuito necesita al menos un pin de entrada y uno de salida.</p>
  {:else}
    <div class="group">
      <h4>Entradas</h4>
      {#each sockets.inputs as socket (socket.pinId)}
        <label class="row">
          <span>{socket.pinId}</span>
          <input type="number" bind:value={socket.value} />
        </label>
      {/each}
    </div>
    <div class="group">
      <h4>Salidas</h4>
      {#each sockets.outputs as socket (socket.pinId)}
        <div class="row"><span>{socket.pinId}</span><span>{socket.value}</span></div>
      {/each}
    </div>
    <p class="hint">La evaluación de la tabla de verdad llega con M8.</p>
  {/if}
</aside>

<style>
  .test-sockets {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.6rem;
    border: 1px solid var(--border);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    font-size: 0.8rem;
  }
  .test-sockets h3 { margin: 0 0 0.3rem; font-size: 0.9rem }
  .test-sockets h4 { margin: 0.4rem 0 0.2rem; font-size: 0.8rem }
  .row { display: flex; justify-content: space-between; gap: 0.4rem; margin: 0.15rem 0 }
  .empty, .hint { margin: 0; color: var(--fg-muted); font-size: 0.75rem }
  input { width: 4rem }
</style>