<script lang="ts">
  import { loadSettings, saveSettings, type Settings } from './settings'
  import { PRESETS } from '../core/theme/presets'
  import { readCustomTheme } from './theme'
  import Icon from './Icon.svelte'

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
    <header class="head">
      <div>
        <h2>Preferencias</h2>
        <p>Apariencia, rejilla y comportamiento del editor.</p>
      </div>
      <button type="button" class="icon-btn" aria-label="Cerrar preferencias" title="Cerrar" onclick={onClose}>
        <Icon name="close" size={17} />
      </button>
    </header>

    <div class="body">
      <section class="group">
        <h3>Apariencia</h3>
        <label class="row">
          <span class="row-text">
            <strong>Tema</strong>
            <small>Colores de la interfaz y del lienzo.</small>
          </span>
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
          <button type="button" class="ghost" onclick={onEditTheme}>
            <Icon name="settings" size={14} />
            Editar tema…
          </button>
        {/if}
      </section>

      <section class="group">
        <h3>Editor</h3>
        <label class="row">
          <span class="row-text">
            <strong>Mostrar rejilla</strong>
            <small>Puntos de referencia en el lienzo.</small>
          </span>
          <input class="switch" type="checkbox" bind:checked={s.gridVisible} />
        </label>
        <label class="row">
          <span class="row-text">
            <strong>Ajustar a la rejilla</strong>
            <small>Las piezas se colocan en celdas exactas.</small>
          </span>
          <input class="switch" type="checkbox" bind:checked={s.snapToGrid} />
        </label>
        <label class="row">
          <span class="row-text">
            <strong>Autoguardado</strong>
            <small>Recupera la sesión si recargas la página.</small>
          </span>
          <input class="switch" type="checkbox" bind:checked={s.autosaveEnabled} />
        </label>
      </section>

      <section class="group">
        <h3>Simulación</h3>
        <label class="row">
          <span class="row-text">
            <strong>Pintar cables al encender</strong>
            <small>Resalta el estado de las conexiones mientras el circuito corre.</small>
          </span>
          <select bind:value={s.paintWiresOnPower}>
            <option value="defaults">Solo los predeterminados</option>
            <option value="always">Siempre</option>
            <option value="never">Nunca</option>
          </select>
        </label>
      </section>

      <section class="group">
        <h3>Colores de cable</h3>
        <p class="group-hint">Cinco colores guardados para el modo cableado.</p>
        <div class="swatches">
          {#each s.savedWireColors as color, i (i)}
            <label class="swatch" title="Color {i + 1}: {color}">
              <input type="color" bind:value={s.savedWireColors[i]} aria-label="Color de cable {i + 1}" />
              <span>{i + 1}</span>
            </label>
          {/each}
        </div>
      </section>
    </div>

    <footer class="actions">
      <button type="button" class="secondary" onclick={onClose}>Cancelar</button>
      <button type="button" class="primary" onclick={apply}>Guardar preferencias</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgb(0 0 0 / 45%);
    backdrop-filter: blur(3px);
  }

  .panel {
    display: flex;
    flex-direction: column;
    width: min(32rem, calc(100vw - 2rem));
    max-height: min(42rem, calc(100vh - 2rem));
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 0.8rem;
    background: var(--panel-bg);
    color: var(--fg);
    box-shadow: 0 24px 70px rgb(0 0 0 / 28%);
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.1rem 0.8rem;
    border-bottom: 1px solid var(--border);
  }

  .head h2 {
    margin: 0;
    font-size: 1.05rem;
    letter-spacing: -0.01em;
  }

  .head p {
    margin: 0.2rem 0 0;
    color: var(--fg-muted);
    font-size: 0.78rem;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1rem 1.1rem;
    overflow-y: auto;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--border);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--bg) 55%, var(--panel-bg));
  }

  .group h3 {
    margin: 0;
    color: var(--fg-muted);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .group-hint {
    margin: -0.15rem 0 0.15rem;
    color: var(--fg-muted);
    font-size: 0.76rem;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    cursor: pointer;
  }

  .row-text {
    display: flex;
    flex-direction: column;
    gap: 0.08rem;
    min-width: 0;
  }

  .row-text strong {
    font-size: 0.84rem;
    font-weight: 600;
  }

  .row-text small {
    color: var(--fg-muted);
    font-size: 0.72rem;
    line-height: 1.35;
  }

  select {
    flex: 0 0 auto;
    min-width: 9rem;
    padding: 0.32rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 0.35rem;
    background: var(--panel-bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.78rem;
  }

  .switch {
    appearance: none;
    position: relative;
    flex: 0 0 auto;
    width: 2.35rem;
    height: 1.3rem;
    margin: 0;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--fg) 10%, var(--panel-bg));
    cursor: pointer;
    transition: background-color 140ms ease, border-color 140ms ease;
  }

  .switch::after {
    content: '';
    position: absolute;
    top: 0.13rem;
    left: 0.13rem;
    width: 0.92rem;
    height: 0.92rem;
    border-radius: 50%;
    background: var(--panel-bg);
    box-shadow: 0 1px 3px rgb(0 0 0 / 28%);
    transition: transform 140ms ease;
  }

  .switch:checked {
    border-color: var(--accent);
    background: var(--accent);
  }

  .switch:checked::after {
    transform: translateX(1.03rem);
  }

  .swatches {
    display: flex;
    gap: 0.5rem;
  }

  .swatch {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.18rem;
    color: var(--fg-muted);
    font-size: 0.66rem;
    cursor: pointer;
  }

  .swatch input {
    width: 2.2rem;
    height: 2.2rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 0.45rem;
    background: transparent;
    cursor: pointer;
  }

  .swatch input::-webkit-color-swatch-wrapper {
    padding: 0.18rem;
  }

  .swatch input::-webkit-color-swatch {
    border: none;
    border-radius: 0.28rem;
  }

  .ghost {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 0.35rem;
    padding: 0.28rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.35rem;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .ghost:hover {
    background: var(--panel-bg-hover);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.8rem 1.1rem 1rem;
    border-top: 1px solid var(--border);
  }

  .actions button {
    padding: 0.42rem 0.8rem;
    border-radius: 0.4rem;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .secondary {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--fg);
  }

  .secondary:hover {
    background: var(--panel-bg-hover);
  }

  .primary {
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--accent-fg);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.9rem;
    height: 1.9rem;
    border: 1px solid transparent;
    border-radius: 0.4rem;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
  }

  .icon-btn:hover {
    background: var(--panel-bg-hover);
    color: var(--fg);
  }

  @media (max-width: 520px) {
    .row {
      align-items: flex-start;
    }

    select {
      min-width: 7rem;
    }
  }
</style>
