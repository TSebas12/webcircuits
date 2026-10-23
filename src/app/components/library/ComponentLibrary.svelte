<script lang="ts">
  import { onMount } from 'svelte'
  import Icon from '../../Icon.svelte'
  import type { SerializedComponent } from '../../../core/persist/component-format'
  import type { ComponentLibrary, LibraryComponent } from './library'

  let {
    library,
    canUse = true,
    onUse,
    onClose,
  }: {
    library: ComponentLibrary
    canUse?: boolean
    onUse: (document: SerializedComponent) => Promise<void> | void
    onClose: () => void
  } = $props()

  let entries = $state<readonly LibraryComponent[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let pendingDelete = $state<string | null>(null)
  let busyId = $state<string | null>(null)

  const refresh = async (): Promise<void> => {
    loading = true
    error = null
    try {
      entries = await library.list()
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo abrir la biblioteca.'
    } finally {
      loading = false
    }
  }

  onMount(() => {
    void refresh()
  })

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    if (pendingDelete !== null) {
      pendingDelete = null
      return
    }
    onClose()
  }

  const use = async (entry: LibraryComponent): Promise<void> => {
    if (!canUse || busyId !== null) return
    busyId = entry.id
    error = null
    try {
      await onUse(entry.document)
      onClose()
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo añadir el componente.'
    } finally {
      busyId = null
    }
  }

  const remove = async (entry: LibraryComponent): Promise<void> => {
    error = null
    try {
      await library.remove(entry.id)
      pendingDelete = null
      await refresh()
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo borrar el componente.'
    }
  }

  const circuitCount = (entry: LibraryComponent): string => {
    const count = entry.document.circuits.length
    return count === 1 ? '1 circuito' : `${count} circuitos`
  }

  const formatDate = (iso: string): string => {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop" role="presentation" onclick={onClose}>
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby="component-library-title"
    tabindex="-1"
    onclick={(event) => event.stopPropagation()}
    onkeydown={(event) => event.stopPropagation()}
  >
    <header>
      <div class="heading">
        <h2 id="component-library-title">Biblioteca de componentes</h2>
        <p class="subtitle">
          {#if loading}
            Leyendo componentes…
          {:else}
            {entries.length} {entries.length === 1 ? 'componente guardado' : 'componentes guardados'}
          {/if}
        </p>
      </div>
      <button type="button" class="icon-btn" onclick={onClose} aria-label="Cerrar biblioteca">
        <Icon name="close" size={16} />
      </button>
    </header>

    {#if error !== null}
      <p class="error" role="alert">{error}</p>
    {/if}

    {#if loading}
      <p class="status">Cargando…</p>
    {:else if entries.length === 0}
      <div class="empty">
        <p class="empty-title">La biblioteca está vacía</p>
        <p>
          Importa un componente <code>.wccomp</code> desde <strong>Subcircuitos</strong> y se
          guardará aquí para el próximo proyecto.
        </p>
      </div>
    {:else}
      <ul class="components">
        {#each entries as entry (entry.id)}
          <li class="component" class:pending={pendingDelete === entry.id}>
            <div class="main">
              <div class="title-row">
                <h3>{entry.name}</h3>
                <span class="count">{circuitCount(entry)}</span>
              </div>
              {#if entry.description !== ''}
                <p class="description">{entry.description}</p>
              {/if}
              <p class="meta">
                {#if entry.author !== ''}<span>{entry.author}</span>{/if}
                {#if formatDate(entry.savedAt) !== ''}<span>{formatDate(entry.savedAt)}</span>{/if}
                {#if entry.tags.length > 0}<span class="tags">{entry.tags.join(' · ')}</span>{/if}
              </p>
            </div>

            {#if pendingDelete === entry.id}
              <div class="confirm">
                <span>¿Borrar?</span>
                <button type="button" class="secondary" onclick={() => (pendingDelete = null)}>
                  Cancelar
                </button>
                <button type="button" class="danger" onclick={() => void remove(entry)}>
                  Borrar
                </button>
              </div>
            {:else}
              <div class="row-actions">
                <button
                  type="button"
                  class="use"
                  disabled={!canUse || busyId !== null}
                  title={canUse
                    ? 'Añadir el componente al proyecto y empezar a colocarlo'
                    : 'Apaga la corriente para añadir componentes'}
                  onclick={() => void use(entry)}
                >
                  {busyId === entry.id ? 'Añadiendo…' : 'Añadir'}
                </button>
                <button
                  type="button"
                  class="icon-btn danger"
                  aria-label="Borrar {entry.name}"
                  title="Borrar de la biblioteca"
                  onclick={() => (pendingDelete = entry.id)}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <footer>
      <span>Guardados en este navegador</span>
      <button type="button" class="secondary" onclick={onClose}>Cerrar</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgb(0 0 0 / 0.45);
  }

  .panel {
    display: flex;
    flex-direction: column;
    width: min(40rem, calc(100vw - 2rem));
    max-height: min(80vh, 44rem);
    padding: 1rem 1.1rem;
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    background: var(--panel-bg);
    box-shadow: 0 10px 30px rgb(0 0 0 / 25%);
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .heading {
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .subtitle {
    margin: 0.2rem 0 0;
    color: var(--fg-muted);
    font-size: 0.76rem;
  }

  .error {
    margin: 0.65rem 0 0;
    padding: 0.45rem 0.55rem;
    border: 1px solid color-mix(in srgb, var(--wc-state-one) 45%, var(--border));
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--wc-state-one) 10%, transparent);
    color: var(--fg);
    font-size: 0.78rem;
  }

  .status {
    margin: 1.2rem 0;
    color: var(--fg-muted);
    font-size: 0.82rem;
    text-align: center;
  }

  .empty {
    margin: 1.2rem 0;
    padding: 1rem;
    border: 1px dashed var(--border);
    border-radius: 0.45rem;
    color: var(--fg-muted);
    font-size: 0.8rem;
    line-height: 1.45;
    text-align: center;
  }

  .empty p {
    margin: 0;
  }

  .empty-title {
    margin-bottom: 0.35rem;
    color: var(--fg);
    font-weight: 600;
  }

  .empty code {
    color: var(--fg);
  }

  .components {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-height: 0;
    margin: 0.8rem 0 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  .component {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.55rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 0.45rem;
    background: color-mix(in srgb, var(--panel-bg) 88%, var(--fg) 12%);
  }

  .component.pending {
    border-color: color-mix(in srgb, var(--wc-state-one) 55%, var(--border));
  }

  .main {
    min-width: 0;
  }

  .title-row {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    min-width: 0;
  }

  .title-row h3 {
    margin: 0;
    overflow: hidden;
    font-size: 0.84rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    flex: none;
    color: var(--fg-muted);
    font-size: 0.68rem;
  }

  .description {
    display: -webkit-box;
    margin: 0.15rem 0 0;
    overflow: hidden;
    color: var(--fg-muted);
    font-size: 0.74rem;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    -webkit-line-clamp: 2;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.55rem;
    margin: 0.22rem 0 0;
    color: var(--fg-muted);
    font-size: 0.66rem;
  }

  .tags {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-actions,
  .confirm {
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.35rem;
  }

  .confirm span {
    color: var(--fg-muted);
    font-size: 0.72rem;
  }

  button {
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--panel-bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.76rem;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: var(--panel-bg-hover);
  }

  button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .use {
    padding: 0.26rem 0.55rem;
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    color: var(--accent);
    font-weight: 600;
  }

  .secondary {
    padding: 0.3rem 0.6rem;
  }

  .danger {
    color: var(--wc-state-one);
  }

  .danger:hover:not(:disabled) {
    border-color: var(--wc-state-one);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.2rem;
    border-color: transparent;
    background: transparent;
  }

  .icon-btn.danger {
    border-color: transparent;
  }

  .icon-btn.danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--wc-state-one) 12%, transparent);
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 0.8rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--border);
  }

  footer span {
    color: var(--fg-muted);
    font-size: 0.68rem;
  }
</style>
