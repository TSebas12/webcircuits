<script lang="ts">
  import { loadSettings, saveSettings, type Settings } from './settings'
  import { PRESETS } from '../core/theme/presets'
  import { readCustomTheme } from './theme'

  let {
    onClose,
    onEditTheme,
  }: { onClose: () => void; onEditTheme?: () => void } = $props()

  let s = $state<Settings>(loadSettings())
  const custom = readCustomTheme()

  const apply = (): void => {
    saveSettings(s)
    onClose()
  }
</script>

<div class="backdrop" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="presentation">
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-label="Preferencias"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <h2>Preferencias</h2>
    <label>Tema
      <select bind:value={s.theme}>
        <option value="auto">Automático</option>
        {#each PRESETS as preset (preset.id)}
          <option value={preset.id}>{preset.name}</option>
        {/each}
        {#if custom !== null}
          <option value="custom">{custom.name}</option>
        {/if}
      </select>
    </label>
    {#if onEditTheme !== undefined}
      <button type="button" class="link" onclick={onEditTheme}>Editar tema…</button>
    {/if}
    <label><input type="checkbox" bind:checked={s.gridVisible} /> Mostrar rejilla</label>
    <label><input type="checkbox" bind:checked={s.snapToGrid} /> Snap a rejilla</label>
    <label><input type="checkbox" bind:checked={s.autosaveEnabled} /> Autoguardado</label>
    <label>Pintar cables al encender
      <select bind:value={s.paintWiresOnPower}>
        <option value="defaults">Solo por defecto</option>
        <option value="always">Siempre</option>
        <option value="never">Nunca</option>
      </select>
    </label>
    <fieldset class="colors">
      <legend>Colores guardados para cables (5)</legend>
      {#each s.savedWireColors as _color, i (i)}
        <label>
          <span>Color {i + 1}</span>
          <input type="color" bind:value={s.savedWireColors[i]} />
        </label>
      {/each}
    </fieldset>
    <div class="actions">
      <button type="button" onclick={onClose}>Cancelar</button>
      <button type="button" onclick={apply}>Guardar</button>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 50 }
  .panel { background: var(--panel-bg); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1rem; width: 20rem; display: flex; flex-direction: column; gap: 0.6rem }
  .panel h2 { margin: 0 0 0.4rem; font-size: 1rem }
  label { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.85rem }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.4rem }
  button { padding: 0.35rem 0.7rem; border: 1px solid var(--border); border-radius: 0.3rem; background: var(--panel-bg); color: var(--fg); cursor: pointer }
  .link { align-self: flex-start; padding: 0; border: none; background: transparent; color: var(--accent); font: inherit; font-size: 0.82rem; text-decoration: underline; cursor: pointer }
</style>
