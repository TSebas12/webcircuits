<script lang="ts">
  import Modal from './common/Modal.svelte'
  import { t } from '../i18n'

  interface Pin {
    id: string
    name: string
    side: 'left' | 'right' | 'top' | 'bottom'
    bitWidth: number
  }

  let {
    open = false,
    pins = [],
    onChange,
    onClose,
  }: {
    open?: boolean
    pins?: Pin[]
    onChange?: (pins: Pin[]) => void
    onClose?: () => void
  } = $props()

  let pinsVal = $state<Pin[]>(pins) // eslint-disable-line svelte/prefer-writable-derived
  $effect(() => { pinsVal = pins })
</script>

<Modal open={open} title={t('dialog.pins.title')} onClose={() => onClose?.()}>
  <div class="pins-list">
    {#each pinsVal as pin (pin.id)}
      <div class="pin-row">
        <input bind:value={pin.name} placeholder={t('dialog.pins.name')} />
        <select bind:value={pin.side}>
          <option value="left">{t('dialog.pins.side.left')}</option>
          <option value="right">{t('dialog.pins.side.right')}</option>
          <option value="top">{t('dialog.pins.side.top')}</option>
          <option value="bottom">{t('dialog.pins.side.bottom')}</option>
        </select>
        <input type="number" bind:value={pin.bitWidth} min={1} max={32} style="width: 4rem" />
      </div>
    {/each}
  </div>
  {#snippet footer()}
    <div class="actions">
      <button type="button" onclick={() => onClose?.()}>{t('common.close')}</button>
      <button type="button" class="primary" onclick={() => { onChange?.(pinsVal); onClose?.() }}>{t('common.save')}</button>
    </div>
  {/snippet}
</Modal>

<style>
  .pins-list { display: flex; flex-direction: column; gap: 0.4rem; }
  .pin-row { display: flex; gap: 0.4rem; }
  input, select {
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--panel-bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
  }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  button { padding: 0.35rem 0.7rem; }
  button.primary { font-weight: 600; }
</style>