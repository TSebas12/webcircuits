<script lang="ts">
  import Modal from './common/Modal.svelte'

  let {
    title,
    label,
    value = '',
    placeholder = '',
    confirmLabel = 'Aceptar',
    onConfirm,
    onCancel,
  }: {
    title: string
    label: string
    value?: string
    placeholder?: string
    confirmLabel?: string
    onConfirm: (text: string) => void
    onCancel: () => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let text = $state(value)
  let input = $state<HTMLInputElement | null>(null)

  $effect(() => {
    input?.focus()
    input?.select()
  })

  function confirm(): void {
    onConfirm(text)
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') onCancel()
    if (event.key === 'Enter') confirm()
  }
</script>

<Modal open={true} title={title} onClose={onCancel}>
  <label>
    <span>{label}</span>
    <input bind:this={input} bind:value={text} {placeholder} onkeydown={onKey} />
  </label>
  {#snippet footer()}
    <div class="actions">
      <button type="button" onclick={onCancel}>Cancelar</button>
      <button type="button" class="primary" onclick={confirm}>{confirmLabel}</button>
    </div>
  {/snippet}
</Modal>

<style>
  label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.75rem; color: var(--fg-muted) }
  input {
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--panel-bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.86rem;
  }
  input:focus { outline: 2px solid color-mix(in srgb, var(--accent, var(--border)) 55%, transparent); outline-offset: 1px }
  .actions { display: flex; justify-content: flex-end; gap: 0.45rem }
  button {
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--panel-bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  button:hover { background: var(--panel-bg-hover) }
  button.primary { font-weight: 600 }
</style>