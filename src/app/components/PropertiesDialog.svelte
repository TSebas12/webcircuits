<script lang="ts">
  import Modal from './common/Modal.svelte'

  let {
    open = false,
    name = '',
    description = '',
    onConfirm,
    onClose,
  }: {
    open?: boolean
    name?: string
    description?: string
    onConfirm?: (name: string, description: string) => void
    onClose?: () => void
  } = $props()

  let nameVal = $state('')
  let descVal = $state('')
  $effect(() => { nameVal = name; descVal = description ?? '' })
</script>

<Modal open={open} title="Propiedades del circuito" onClose={() => onClose?.()}>
  <label>
    <span>Nombre</span>
    <input bind:value={nameVal} />
  </label>
  <label>
    <span>Descripción</span>
    <textarea bind:value={descVal} rows={3}></textarea>
  </label>
  {#snippet footer()}
    <div class="actions">
      <button type="button" onclick={() => onClose?.()}>Cancelar</button>
      <button type="button" class="primary" onclick={() => { onConfirm?.(nameVal, descVal); onClose?.() }}>Guardar</button>
    </div>
  {/snippet}
</Modal>

<style>
  label { display: flex; flex-direction: column; gap: 0.3rem; }
  input, textarea {
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--panel-bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.86rem;
  }
  textarea { min-height: 6rem; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  button { padding: 0.35rem 0.7rem; }
  button.primary { font-weight: 600; }
</style>