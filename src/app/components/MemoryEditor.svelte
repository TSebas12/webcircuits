<script lang="ts">
  import Modal from './common/Modal.svelte'
  import { t } from '../i18n'

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

  let text = $state('') // eslint-disable-line svelte/prefer-writable-derived
  $effect(() => { text = value })
</script>

<Modal open={open} title={t('dialog.memory.title')} onClose={() => onClose?.()}>
  <div class="mem-editor">
    <div class="header">
      <span>{t('dialog.memory.dataBits').replace('{bits}', String(bitWidth))}</span>
      <span>{t('dialog.memory.addrBits').replace('{bits}', String(addressWidth))}</span>
    </div>
    <label>
      <span>{t('dialog.memory.dataLabel')}</span>
      <textarea bind:value={text} spellcheck="false"></textarea>
    </label>
  </div>
  {#snippet footer()}
    <div class="actions">
      <button type="button" onclick={() => onClose?.()}>{t('common.cancel')}</button>
      <button type="button" class="primary" onclick={() => { onChange?.(text); onClose?.() }}>{t('common.save')}</button>
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