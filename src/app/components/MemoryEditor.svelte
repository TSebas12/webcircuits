<script lang="ts">
  import Modal from './common/Modal.svelte'

  let {
    open = false,
    value = '',
    onChange,
    onClose,
    bitWidth = 4,
    addressWidth = 4,
  }: {
    open?: boolean
    value?: string
    onChange?: (value: string) => void
    onClose?: () => void
    bitWidth?: number
    addressWidth?: number
  } = $props()

  // eslint-disable-next-line svelte/prefer-writable-derived
  let text = $state('')
  $effect(() => { text = value })
</script>

<Modal open={open} title="Editor de memoria" onClose={() => onClose?.()}>
  <div class="mem-editor">
    <div class="header">
      <span>Ancho datos: {bitWidth} bits</span>
      <span>Ancho dir.: {addressWidth} bits</span>
    </div>
    <label>
      <span>Datos (hex, 1 por línea)</span>
      <textarea bind:value={text} spellcheck="false"></textarea>
    </label>
  </div>
  {#snippet footer()}
    <div class="actions">
      <button type="button" onclick={() => onClose?.()}>Cancelar</button>
      <button type="button" class="primary" onclick={() => { onChange?.(text); onClose?.() }}>Guardar</button>
    </div>
  {/snippet}
</Modal>

<style>
  .mem-editor { display: flex; flex-direction: column; gap: 0.5rem; }
  .header { display: flex; gap: 1rem; font-size: 0.8rem; color: var(--fg-muted); }
  textarea { min-height: 12rem; width: 100%; font-family: monospace; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  button { padding: 0.35rem 0.7rem; }
  button.primary { font-weight: 600; }
</style>