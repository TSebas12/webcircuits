<script lang="ts">
  import { onMount } from 'svelte'
  import type { Editor } from './editor'
  import type { Layer } from '../core/model/types'

  let {
    editor,
    onClose,
  }: { editor: Editor | null; onClose?: () => void } = $props()

  let layers = $state<Layer[]>([])
  let activeId = $state('principal')
  const activeIndex = $derived(layers.findIndex((layer) => layer.id === activeId))

  const refresh = (): void => {
    if (editor === null) return
    layers = [...editor.diagram.layersList]
    activeId = editor.diagram.activeLayerId
  }

  onMount(() => {
    refresh()
    // El documento no avisa de los cambios de capa a este panel: se sondea a un ritmo bajo,
    // que para una lista de capas es de sobra y evita acoplar la vista al modelo.
    const timer = setInterval(refresh, 300)
    return () => clearInterval(timer)
  })

  const create = (): void => {
    if (editor === null) return
    const layer = editor.diagram.createLayer()
    editor.diagram.activeLayerId = layer.id
    refresh()
  }

  const rename = (id: string, name: string): void => {
    const clean = name.trim()
    if (editor === null || clean === '') {
      refresh()
      return
    }
    editor.diagram.renameLayer(id, clean)
    refresh()
  }

  const remove = (id: string): void => {
    editor?.diagram.deleteLayer(id)
    refresh()
  }

  const toggleVisibility = (layer: Layer): void => {
    editor?.diagram.setLayerVisible(layer.id, !layer.visible)
    refresh()
  }

  const toggleLock = (layer: Layer): void => {
    editor?.diagram.setLayerLocked(layer.id, !layer.locked)
    refresh()
  }

  const duplicate = (): void => {
    if (editor === null) return
    const copy = editor.diagram.duplicateLayer(activeId)
    if (copy !== null) {
      editor.diagram.activeLayerId = copy.id
    }
    refresh()
  }

  const mergeIntoPrincipal = (): void => {
    editor?.diagram.mergeLayer(activeId, 'principal')
    refresh()
  }

  const isolate = (): void => {
    editor?.diagram.isolateLayer(activeId)
    refresh()
  }

  const showAll = (): void => {
    editor?.diagram.showAllLayers()
    refresh()
  }

  const selectAll = (): void => {
    editor?.selectAllInLayer(activeId)
    refresh()
  }

  const reorder = (delta: number): void => {
    editor?.diagram.moveLayer(activeId, delta)
    refresh()
  }

  const setActive = (id: string): void => {
    if (editor === null) return
    editor.diagram.activeLayerId = id
    refresh()
  }

  const moveSelection = (id: string): void => {
    editor?.moveSelectionToLayer(id)
    refresh()
  }
</script>

<aside class="layers" aria-label="Capas del circuito">
  <header>
    <span>Capas</span>
    <span class="actions">
      <button type="button" title="Nueva capa" aria-label="Nueva capa" onclick={create}>+</button>
      {#if onClose !== undefined}
        <button type="button" title="Cerrar capas" aria-label="Cerrar capas" onclick={onClose}>×</button>
      {/if}
    </span>
  </header>
  <ul>
    {#each layers as layer (layer.id)}
      <li class:active={layer.id === activeId}>
        <button
          type="button"
          class="use"
          class:on={layer.id === activeId}
          title={layer.id === activeId ? 'Capa activa: aquí caen las piezas nuevas' : 'Hacer esta la capa activa'}
          aria-label="Capa activa: {layer.name}"
          aria-pressed={layer.id === activeId}
          onclick={() => setActive(layer.id)}
        >{layer.id === activeId ? '●' : '○'}</button>
        <button
          type="button"
          class="vis"
          title={layer.visible ? 'Ocultar capa' : 'Mostrar capa'}
          aria-label={layer.visible ? 'Ocultar capa' : 'Mostrar capa'}
          aria-pressed={!layer.visible}
          onclick={() => toggleVisibility(layer)}
        >{layer.visible ? '●' : '○'}</button>
        <button
          type="button"
          class="lock"
          title={layer.locked ? 'Desbloquear capa' : 'Bloquear capa'}
          aria-label={layer.locked ? 'Desbloquear capa' : 'Bloquear capa'}
          aria-pressed={layer.locked}
          onclick={() => toggleLock(layer)}
        >{layer.locked ? '■' : '□'}</button>
        <input
          value={layer.name}
          aria-label="Nombre de la capa"
          onblur={(event) => rename(layer.id, (event.currentTarget as HTMLInputElement).value)}
        />
        <button
          type="button"
          class="move"
          title="Mover la selección a esta capa"
          aria-label="Mover la selección a {layer.name}"
          onclick={() => moveSelection(layer.id)}
        >↪</button>
        {#if layer.id !== 'principal'}
          <button
            type="button"
            class="del"
            title="Borrar capa (sus piezas pasan a la principal)"
            aria-label="Borrar capa {layer.name}"
            onclick={() => remove(layer.id)}
          >×</button>
        {/if}
      </li>
    {/each}
  </ul>
  <div class="ops">
    <button type="button" title="Duplicar la capa activa con sus piezas" onclick={duplicate}>Duplicar</button>
    <button
      type="button"
      title="Mover las piezas de la capa activa a la principal y borrarla"
      disabled={activeId === 'principal'}
      onclick={mergeIntoPrincipal}
    >Fusionar</button>
    <button type="button" title="Ocultar las demás capas" onclick={isolate}>Aislar</button>
    <button type="button" title="Mostrar todas las capas" onclick={showAll}>Ver todas</button>
    <button type="button" title="Seleccionar todas las piezas de la capa activa" onclick={selectAll}>Todo</button>
    <button
      type="button"
      title="Subir la capa activa en el orden de dibujado"
      disabled={activeIndex < 0 || activeIndex >= layers.length - 1}
      onclick={() => reorder(1)}
    >↑</button>
    <button
      type="button"
      title="Bajar la capa activa en el orden de dibujado"
      disabled={activeIndex <= 0}
      onclick={() => reorder(-1)}
    >↓</button>
  </div>
  <p class="hint">La capa ● recibe las piezas nuevas. ↪ mueve lo seleccionado.</p>
</aside>

<style>
  /* En flujo dentro de `.left-rail`: comparte columna con la paleta en vez de flotar encima
     de ella. Así no hay dos cajas absolutas peleándose por el mismo `left`. */
  .layers {
    flex: 0 0 auto;
    width: 100%;
    max-height: 15rem;
    overflow-y: auto;
    padding: 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    color: var(--fg);
    font-size: 0.78rem;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.3rem;
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: 0.15rem;
  }

  header button,
  .vis,
  .lock,
  .use,
  .move,
  .del {
    border: 1px solid transparent;
    border-radius: 0.25rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0 0.1rem;
    font: inherit;
    font-size: 0.75rem;
    line-height: 1.5;
  }

  header button:hover,
  .vis:hover,
  .lock:hover,
  .use:hover,
  .move:hover,
  .del:hover {
    background: var(--panel-bg-hover);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.1rem 0.15rem;
    border-radius: 0.3rem;
  }

  li.active {
    background: color-mix(in srgb, var(--wc-selection) 12%, transparent);
  }

  .use {
    color: var(--fg-muted);
    font-size: 0.7rem;
  }

  .use.on {
    color: var(--wc-selection);
  }

  li input {
    flex: 1 1 auto;
    min-width: 3rem;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    padding: 0.1rem 0.3rem;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.74rem;
  }

  .ops {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem;
    margin-top: 0.35rem;
  }

  .ops button {
    padding: 0.08rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    background: var(--panel-bg);
    color: inherit;
    font: inherit;
    font-size: 0.68rem;
    cursor: pointer;
  }

  .ops button:hover:not(:disabled) {
    background: var(--panel-bg-hover);
  }

  .ops button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .hint {
    margin: 0.35rem 0.15rem 0;
    color: var(--fg-muted);
    font-size: 0.66rem;
    line-height: 1.35;
  }
</style>
