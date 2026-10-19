<script lang="ts">
  let {
    onClose,
    onPick,
  }: { onClose: () => void; onPick: (id: string) => void } = $props()

  const examples = [
    { id: 'and', name: 'Compuerta AND', desc: 'Dos interruptores y un LED' },
    { id: 'or', name: 'Compuerta OR', desc: 'La salida se enciende si alguna entrada es 1' },
    { id: 'not', name: 'Inversor NOT', desc: 'Una entrada, salida contraria' },
    { id: 'xor', name: 'Compuerta XOR', desc: 'Uno u otro, pero no los dos' },
    { id: 'clock', name: 'Reloj a LED', desc: 'Un reloj que parpadea' },
  ]
</script>

<div class="backdrop" role="presentation" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
  <div class="panel" role="dialog" aria-modal="true" aria-label="Elegir ejemplo" onclick={(e) => e.stopPropagation()}>
    <h2>Ejemplos de circuito</h2>
    <div class="grid">
      {#each examples as ex (ex.id)}
        <button type="button" class="card" onclick={() => onPick(ex.id)}>
          <span class="name">{ex.name}</span>
          <span class="desc">{ex.desc}</span>
        </button>
      {/each}
    </div>
    <div class="actions">
      <button type="button" onclick={onClose}>Cerrar</button>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 60 }
  .panel { background: var(--panel-bg); border: 1px solid var(--border); border-radius: 0.55rem; padding: 1rem; width: min(34rem, calc(100vw - 2rem)); display: flex; flex-direction: column; gap: 0.6rem }
  .panel h2 { margin: 0; font-size: 1rem }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem }
  .card { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.6rem; border: 1px solid var(--border); border-radius: 0.4rem; background: var(--panel-bg); color: var(--fg); cursor: pointer; text-align: left; font: inherit }
  .card:hover { background: var(--panel-bg-hover) }
  .name { font-weight: 600; font-size: 0.85rem }
  .desc { font-size: 0.72rem; color: var(--fg-muted) }
  .actions { display: flex; justify-content: flex-end }
  .actions button { padding: 0.35rem 0.75rem; border: 1px solid var(--border); border-radius: 0.3rem; background: var(--panel-bg); color: var(--fg); cursor: pointer; font: inherit; font-size: 0.82rem }
</style>