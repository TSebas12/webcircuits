<script lang="ts">
  import { onMount } from 'svelte'
  import Diagram from './app/Diagram.svelte'
  import ScriptPanel from './app/components/scripting/ScriptPanel.svelte'
  import Modal from './app/components/common/Modal.svelte'
  import {
    applyTheme,
    nextThemeSelection,
    readCustomTheme,
    readThemeSelection,
    storeThemeSelection,
    themeSelectionLabel,
    type ThemeSelection,
  } from './app/theme'
  import type { Theme } from './core/theme/theme'
  import { SETTINGS_EVENT } from './app/settings'

  const version = '0.0.0'

  let showScript = $state(false)
  let showHelp = $state(false)
  let showTour = $state(false)

  let selection = $state<ThemeSelection>('auto')
  let custom = $state<Theme | null>(null)

  /** Lo rellena `onMount`. Antes de eso no hay nada que consultar. */
  let systemTheme: MediaQueryList | null = null

  const show = (next: ThemeSelection): void => {
    selection = next
    applyTheme(next, { systemPrefersDark: systemTheme?.matches ?? false, custom })
  }

  const cycleTheme = (): void => {
    const next = nextThemeSelection(selection)
    show(next)
    storeThemeSelection(next)
  }

  onMount(() => {
    systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
    showTour = localStorage.getItem('wc-tour-seen') !== '1'

    // Si manda el sistema...

    // Si manda el sistema, hay que enterarse de cuándo el usuario cambia Windows.
    const onSystemChange = (): void => {
      if (selection === 'auto') {
        show('auto')
      }
    }

    custom = readCustomTheme()
    show(readThemeSelection())
    systemTheme.addEventListener('change', onSystemChange)

    // El panel de Preferencias guarda el tema en el mismo sitio que este botón: si cambia
    // desde allí, hay que reflejarlo sin recargar.
    const onSettings = (): void => {
      custom = readCustomTheme()
      show(readThemeSelection())
    }
    window.addEventListener(SETTINGS_EVENT, onSettings)

    return () => {
      systemTheme?.removeEventListener('change', onSystemChange)
      window.removeEventListener(SETTINGS_EVENT, onSettings)
    }
  })
</script>

<div class="shell">
  <header>
    <span class="brand">WebCircuits</span>
    <span class="hint"
      >elige una pieza y haz clic · cablea arrastrando o con dos clics en los pines · rueda para
      acercar</span
    >
    <span class="spacer"></span>
    <button type="button" onclick={() => (showScript = true)} title="Script Python">Py</button>
    <button type="button" onclick={() => (showHelp = true)} title="Ayuda">?</button>
    <span class="version">v{version}</span>
    <button
      class="theme"
      type="button"
      onclick={cycleTheme}
      title="Cambiar de tema (automático, claro, oscuro, alto contraste, daltónico, monocromo)"
    >
      {themeSelectionLabel(selection, custom)}
    </button>
  </header>

  {#if showScript}
    <div class="script-dock">
      <ScriptPanel onClose={() => (showScript = false)} />
    </div>
  {/if}

  {#if showHelp}
    <Modal open={true} title="Ayuda rapida" onClose={() => (showHelp = false)}>
      <p>Elige una pieza y haz click para colocar. Cablea arrastrando entre pines. Rueda para acercar.</p>
    </Modal>
  {/if}

  {#if showTour}
    <Modal open={true} title="Tour inicial" onClose={() => { localStorage.setItem('wc-tour-seen', '1'); showTour = false }}>
      <p>Bienvenido. Elige una pieza, colocala y cablea. Usa rueda para zoom. Abre la paleta con Ctrl+K si aplica.</p>
    </Modal>
  {/if}

  <Diagram />
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg);
    color: var(--fg);
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 0 0 auto;
    padding: 0.5rem 0.9rem;
    border-bottom: 1px solid var(--border);
    background: var(--panel-bg);
  }

  .brand {
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .hint,
  .version {
    font-size: 0.78rem;
    color: var(--fg-muted);
  }

  .hint {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spacer {
    flex: 1 1 auto;
  }

  .brand,
  .version {
    flex: 0 0 auto;
  }

  .theme {
    flex: 0 0 auto;
    min-width: 6.5rem;
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 0.45rem;
    background: var(--panel-bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }

  .theme:hover {
    background: var(--panel-bg-hover);
  }

  .theme:focus-visible {
    outline: 2px solid var(--wc-selection);
    outline-offset: 2px;
  }

  @media (max-width: 700px) {
    .hint,
    .version {
      display: none;
    }

    header {
      gap: 0.5rem;
      padding: 0.5rem 0.6rem;
    }

    .theme {
      min-width: 0;
      margin-left: auto;
    }
  }
</style>
