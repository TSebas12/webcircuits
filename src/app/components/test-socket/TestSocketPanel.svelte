<script lang="ts">
  import type { StoredElement } from '../../../core/model/types'
  import Icon from '../../Icon.svelte'
  import { createTestSockets } from '../../../core/model/test-socket'

  let {
    elements = [],
    onClose,
    onOpenTruthTable,
  }: {
    elements?: readonly StoredElement[]
    onClose: () => void
    onOpenTruthTable?: () => void
  } = $props()

  const sockets = $derived(createTestSockets(elements))

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') onClose()
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop" role="presentation" onclick={onClose}>
  <div
    class="test-sockets"
    role="dialog"
    aria-modal="true"
    aria-label="Sockets de test"
    tabindex="-1"
    onclick={(event) => event.stopPropagation()}
    onkeydown={(event) => event.stopPropagation()}
  >
    <header>
      <h3>Sockets de test</h3>
      <button type="button" class="close" onclick={onClose} aria-label="Cerrar" title="Cerrar"><Icon name="close" size={16} /></button>
    </header>

    {#if sockets === null}
      <p class="empty">El circuito necesita al menos un pin de entrada y uno de salida.</p>
    {:else}
      <div class="group">
        <h4>Entradas</h4>
        {#each sockets.inputs as socket (socket.pinId)}
          <label class="row">
            <span>{socket.pinId}</span>
            <input type="number" min="0" bind:value={socket.value} />
          </label>
        {/each}
      </div>
      <div class="group">
        <h4>Salidas</h4>
        {#each sockets.outputs as socket (socket.pinId)}
          <div class="row"><span>{socket.pinId}</span><span class="value">—</span></div>
        {/each}
      </div>
      <p class="hint">Los valores de salida se leen en la tabla de verdad, que recorre todas las combinaciones.</p>
    {/if}

    {#if onOpenTruthTable}
      <button type="button" class="primary" onclick={onOpenTruthTable}>Abrir tabla de verdad</button>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgb(0 0 0 / 0.4);
  }
  .test-sockets {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: min(22rem, calc(100vw - 2rem));
    padding: 0.85rem 0.95rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--panel-bg);
    box-shadow: 0 14px 40px rgb(0 0 0 / 30%);
    font-size: 0.8rem;
  }
  header { display: flex; align-items: center; justify-content: space-between; gap: 1rem }
  h3 { margin: 0; font-size: 0.98rem; font-weight: 600 }
  .close {
    width: 1.7rem;
    height: 1.7rem;
    border: 1px solid transparent;
    border-radius: 0.3rem;
    background: transparent;
    color: var(--fg-muted);
    font-size: 1.05rem;
    line-height: 1;
    cursor: pointer;
  }
  .close:hover { background: var(--panel-bg-hover); color: var(--fg) }
  h4 { margin: 0.45rem 0 0.2rem; font-size: 0.78rem; color: var(--fg-muted) }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0.16rem 0 }
  .row span:first-child { font-family: ui-monospace, monospace; font-size: 0.76rem }
  .value { color: var(--fg-muted) }
  input {
    width: 5rem;
    padding: 0.2rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    background: var(--panel-bg);
    color: var(--fg);
    font: inherit;
  }
  .empty, .hint { margin: 0.3rem 0 0; color: var(--fg-muted); font-size: 0.74rem }
  button.primary {
    margin-top: 0.55rem;
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--panel-bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  button.primary:hover { background: var(--panel-bg-hover) }
</style>
