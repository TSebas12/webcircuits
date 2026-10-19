<script lang="ts">
  let {
    title = 'Confirmar',
    message,
    confirmLabel = 'Aceptar',
    cancelLabel = 'Cancelar',
    danger = false,
    onConfirm,
    onCancel,
  }: {
    title?: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    onConfirm: () => void
    onCancel: () => void
  } = $props()

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') onCancel()
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop" role="presentation" onclick={onCancel}>
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
  >
    <h2>{title}</h2>
    <p>{message}</p>
    <div class="actions">
      <button type="button" onclick={onCancel}>{cancelLabel}</button>
      <button type="button" class:danger onclick={onConfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 60 }
  .panel { background: var(--panel-bg); border: 1px solid var(--border); border-radius: 0.55rem; padding: 1rem 1.1rem; width: min(26rem, calc(100vw - 2rem)); display: flex; flex-direction: column; gap: 0.6rem; box-shadow: 0 10px 30px rgb(0 0 0 / 25%) }
  .panel h2 { margin: 0; font-size: 1rem }
  .panel p { margin: 0; font-size: 0.85rem; color: var(--fg) }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.4rem }
  button { padding: 0.35rem 0.75rem; border: 1px solid var(--border); border-radius: 0.3rem; background: var(--panel-bg); color: var(--fg); cursor: pointer; font: inherit; font-size: 0.82rem }
  button.danger { border-color: var(--wc-state-one); color: var(--wc-state-one) }
  button:hover { background: var(--panel-bg-hover) }
</style>