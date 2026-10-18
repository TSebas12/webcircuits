<script lang="ts">
  import { onMount } from 'svelte'
  import Diagram from './app/Diagram.svelte'
  import {
    applyTheme,
    nextThemeChoice,
    readThemeChoice,
    storeThemeChoice,
    type ThemeChoice,
  } from './app/theme'

  const version = '0.0.0'

  /** Cómo se muestra cada estado del tema en el botón. */
  const LABELS: Readonly<Record<ThemeChoice, string>> = {
    auto: '◐ Auto',
    light: '☀ Claro',
    dark: '☾ Oscuro',
  }

  let choice = $state<ThemeChoice>('auto')

  /** Lo rellena `onMount`. Antes de eso no hay nada que consultar. */
  let systemTheme: MediaQueryList | null = null

  const show = (next: ThemeChoice): void => {
    choice = next
    applyTheme(next, systemTheme?.matches ?? false)
  }

  const cycleTheme = (): void => {
    const next = nextThemeChoice(choice)
    show(next)
    storeThemeChoice(next)
  }

  onMount(() => {
    systemTheme = window.matchMedia('(prefers-color-scheme: dark)')

    // Si manda el sistema, hay que enterarse de cuándo el usuario cambia Windows.
    const onSystemChange = (): void => {
      if (choice === 'auto') {
        show('auto')
      }
    }

    show(readThemeChoice())
    systemTheme.addEventListener('change', onSystemChange)

    return () => {
      systemTheme?.removeEventListener('change', onSystemChange)
    }
  })
</script>

<div class="shell">
  <header>
    <span class="brand">WebCircuits</span>
    <span class="hint">arrastra para mover · rueda para acercar</span>
    <span class="spacer"></span>
    <span class="version">v{version} · M1</span>
    <button
      class="theme"
      type="button"
      onclick={cycleTheme}
      title="Cambiar entre tema automático, claro y oscuro"
    >
      {LABELS[choice]}
    </button>
  </header>

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

  .spacer {
    flex: 1 1 auto;
  }

  .theme {
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
</style>
