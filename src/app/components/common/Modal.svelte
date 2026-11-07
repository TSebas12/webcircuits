<script lang="ts">
  import type { Snippet } from 'svelte'
  let {
    open = false,
    title = '',
    onClose,
    children,
    footer,
  }: {
    open?: boolean
    title?: string
    onClose?: () => void
    children?: Snippet
    footer?: Snippet
  } = $props()

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') onClose?.()
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={() => onClose?.()}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={onKeydown}
    >
      {#if title}
        <header class="modal-header">
          <h2>{title}</h2>
          <button class="modal-close" type="button" onclick={() => onClose?.()} aria-label="Cerrar">×</button>
        </header>
      {/if}
      <div class="modal-body">
        {@render children?.()}
      </div>
      <footer class="modal-footer">
        {@render footer?.()}
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal {
    background: var(--wc-bg, #ffffff);
    color: var(--wc-text, #111);
    border-radius: 0.5rem;
    min-width: 18rem;
    max-width: 90vw;
    max-height: 90vh;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--wc-border, #ddd);
  }
  .modal-header h2 { margin: 0; font-size: 1rem; }
  .modal-close {
    background: transparent;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    color: inherit;
  }
  .modal-body { padding: 1rem; overflow: auto; flex: 1; }
  .modal-footer { padding: 0.75rem 1rem; border-top: 1px solid var(--wc-border, #ddd); }
</style>