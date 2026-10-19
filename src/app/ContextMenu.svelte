<script lang="ts">
  export interface MenuItem {
    readonly label: string
    readonly shortcut?: string
    readonly danger?: boolean
    readonly action: () => void
  }

  let { x, y, items, onClose }: {
    x: number
    y: number
    items: MenuItem[]
    onClose: () => void
  } = $props()

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
</script>

<svelte:window onkeydown={onKey} onclick={onClose} />

<div class="ctx" style="left:{x}px; top:{y}px;" role="menu">
  {#each items as item, i (i)}
    <button
      type="button"
      class="ctx-item"
      class:danger={item.danger}
      role="menuitem"
      onclick={() => { item.action(); onClose() }}
    >
      <span>{item.label}</span>
      {#if item.shortcut}<kbd>{item.shortcut}</kbd>{/if}
    </button>
  {/each}
</div>

<style>
  .ctx {
    position: absolute;
    z-index: 20;
    min-width: 12rem;
    padding: 0.3rem;
    border: 1px solid var(--border);
    border-radius: 0.4rem;
    background: var(--panel-bg);
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .ctx-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.35rem 0.6rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
  }
  .ctx-item:hover { background: var(--panel-bg-hover) }
  .ctx-item.danger { color: #e53935 }
  .ctx-item kbd {
    font: 0.7rem/1 var(--font-mono);
    color: var(--fg-muted);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 0.2rem;
    padding: 0.1rem 0.3rem;
  }
</style>