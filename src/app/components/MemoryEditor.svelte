<script lang="ts">
  import Modal from './common/Modal.svelte'

  let { open = false, value = '', onChange, onClose }: {
    open?: boolean
    value?: string
    onChange?: (value: string) => void
    onClose?: () => void
  } = $props()

  // eslint-disable-next-line svelte/prefer-writable-derived
  let text = $state('')
  $effect(() => { text = value })
</script>

<Modal open={open} title="Editor de memoria" onClose={() => onClose?.()}>
  <label>
    <span>Datos (hex)</span>
    <textarea bind:value={text} spellcheck="false"></textarea>
  </label>
  {#snippet footer()}
    <div class="actions">
      <button type="button" onclick={() => onClose?.()}>Cancelar</button>
      <button type="button" class="primary" onclick={() => { onChange?.(text); onClose?.() }}>Guardar</button>
    </div>
  {/snippet}
</Modal>

<style>
  textarea { min-height: 12rem; width: 100%; font-family: monospace; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  button { padding: 0.35rem 0.7rem; }
  button.primary { font-weight: 600; }
</style>