<script lang="ts">
  import { onMount } from 'svelte'
  import type { Snippet } from 'svelte'
  import { t } from '../../i18n'
  
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

  let modalEl = $state<HTMLDivElement | null>(null)
  let previouslyFocused = $state<HTMLElement | null>(null)

  function trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return
    if (!modalEl) return
    
    const focusableElements = modalEl.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault()
        lastElement?.focus()
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault()
        firstElement?.focus()
      }
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose?.()
      return
    }
    trapFocus(event)
  }

  onMount(() => {
    if (open && modalEl) {
      previouslyFocused = document.activeElement as HTMLElement
      // Focus first focusable element or the modal itself
      const firstFocusable = modalEl.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      firstFocusable?.focus()
      // Add keydown listener for focus trap
      modalEl.addEventListener('keydown', trapFocus)
    }
    return () => {
      if (modalEl) {
        modalEl.removeEventListener('keydown', trapFocus)
      }
      // Restore focus to previously focused element
      previouslyFocused?.focus()
    }
  })
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
      bind:this={modalEl}
    >
      {#if title}
        <header class="modal-header">
          <h2>{title}</h2>
          <button class="modal-close" type="button" onclick={() => onClose?.()} aria-label={t('common.close')}>×</button>
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