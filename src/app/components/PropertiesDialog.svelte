<script lang="ts">
  import Modal from './common/Modal.svelte'

  let {
    open = false,
    name = '',
    onConfirm,
    onClose,
  }: {
    open?: boolean
    name?: string
    onConfirm?: (name: string) => void
    onClose?: () => void
  } = $props()

  // eslint-disable-next-line svelte/prefer-writable-derived
  let value = $state('')
  $effect(() => { value = name })
</script>

<!-- eslint-disable-next-line svelte/prefer-writable-derived -->
<Modal open={open} title="Propiedades del circuito" onClose={() => onClose?.()}>
  <label>
    <span>Nombre</span>
    <input bind:value />
  </label>
  {#snippet footer()}
    <div class="actions">
      <button onclick={() => onClose?.()}>Cancelar</button>
      <button class="primary" onclick={() => onConfirm?.(value)}>Aceptar</button>
    </div>
  {/snippet}
</Modal>

<style>
  label { display: flex; flex-direction: column; gap: 0.3rem; }
  input { padding: 0.4rem; border: 1px solid var(--border); border-radius: 0.3rem; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  button.primary { font-weight: 600; }
</style>