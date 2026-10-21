<script lang="ts">
  import { onMount } from 'svelte'
  import type { Editor } from './editor'
  import type { Layer } from '../core/model/types'
  import Icon from './Icon.svelte'

  let { editor, onClose }: { editor: Editor | null; onClose?: () => void } = $props()

  let layers = $state<Layer[]>([])
  let activeId = $state('principal')
  let dim = $state(false)
  const activeIndex = $derived(layers.findIndex((layer) => layer.id === activeId))

  const refresh = (): void => {
    if (editor === null) return
    layers = [...editor.diagram.layersList]
    activeId = editor.diagram.activeLayerId
    dim = editor.diagram.dimOtherLayers
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

  const toggleDim = (): void => {
    if (editor === null) return
    editor.diagram.dimOtherLayers = !editor.diagram.dimOtherLayers
    refresh()
  }

  // Arrastrar filas para reordenar (M5).
  let dragIndex = $state<number | null>(null)
  const onDragStart = (index: number): void => {
    dragIndex = index
  }
  const onDragOver = (event: DragEvent): void => {
    event.preventDefault()
  }
  const onDrop = (index: number): void => {
    if (dragIndex === null || editor === null) return
    const id = layers[dragIndex]?.id
    if (id !== undefined) {
      editor.diagram.moveLayerTo(id, index)
    }
    dragIndex = null
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
      <button
        type="button"
        class="icon"
        title="Subir la capa activa en el orden de dibujado"
        aria-label="Subir la capa activa"
        disabled={activeIndex < 0 || activeIndex >= layers.length - 1}
        onclick={() => reorder(1)}
      >
        <Icon name="up" size={14} />
      </button>
      <button
        type="button"
        class="icon"
        title="Bajar la capa activa en el orden de dibujado"
        aria-label="Bajar la capa activa"
        disabled={activeIndex <= 0}
        onclick={() => reorder(-1)}
      >
        <Icon name="down" size={14} />
      </button>
      <button
        type="button"
        class="icon"
        title="Nueva capa"
        aria-label="Nueva capa"
        onclick={create}
      >
        <Icon name="plus" size={14} />
      </button>
      {#if onClose !== undefined}
        <button
          type="button"
          class="icon"
          title="Cerrar capas"
          aria-label="Cerrar capas"
          onclick={onClose}
        >
          <Icon name="close" size={14} />
        </button>
      {/if}
    </span>
  </header>
  <ul>
    {#each layers as layer, index (layer.id)}
      <li
        class:active={layer.id === activeId}
        draggable="true"
        ondragstart={() => onDragStart(index)}
        ondragover={onDragOver}
        ondrop={() => onDrop(index)}
      >
        <div class="layer-main">
          <button
            type="button"
            class="use"
            class:on={layer.id === activeId}
            title={layer.id === activeId
              ? 'Capa activa: aquí caen las piezas nuevas'
              : 'Hacer esta la capa activa'}
            aria-label="Capa activa: {layer.name}"
            aria-pressed={layer.id === activeId}
            onclick={() => setActive(layer.id)}><Icon name="target" size={14} /></button
          >
          <input
            value={layer.name}
            aria-label="Nombre de la capa"
            onblur={(event) => rename(layer.id, (event.currentTarget as HTMLInputElement).value)}
          />
          {#if layer.id !== 'principal'}
            <button
              type="button"
              class="del"
              title="Borrar capa (sus piezas pasan a la principal)"
              aria-label="Borrar capa {layer.name}"
              onclick={() => remove(layer.id)}><Icon name="trash" size={14} /></button
            >
          {/if}
        </div>
        <div class="layer-tools">
          <span class="tool">
            <button
              type="button"
              class="vis"
              class:off={!layer.visible}
              title={layer.visible ? 'Ocultar capa' : 'Mostrar capa'}
              aria-label={layer.visible ? 'Ocultar capa' : 'Mostrar capa'}
              aria-pressed={!layer.visible}
              onclick={() => toggleVisibility(layer)}
              ><Icon name={layer.visible ? 'eye' : 'eyeOff'} size={13} /></button
            >
            <span>{layer.visible ? 'Visible' : 'Oculta'}</span>
          </span>
          <span class="tool">
            <button
              type="button"
              class="lock"
              class:on={layer.locked}
              title={layer.locked ? 'Desbloquear capa' : 'Bloquear capa'}
              aria-label={layer.locked ? 'Desbloquear capa' : 'Bloquear capa'}
              aria-pressed={layer.locked}
              onclick={() => toggleLock(layer)}
              ><Icon name={layer.locked ? 'lock' : 'unlock'} size={13} /></button
            >
            <span>{layer.locked ? 'Bloqueada' : 'Editable'}</span>
          </span>
          <button
            type="button"
            class="move"
            title="Mover la selección a esta capa"
            aria-label="Mover la selección a {layer.name}"
            onclick={() => moveSelection(layer.id)}
            ><Icon name="arrowRight" size={12} /><span>Mover aquí</span></button
          >
        </div>
      </li>
    {/each}
  </ul>
  <div class="ops">
    <button type="button" title="Duplicar la capa activa con sus piezas" onclick={duplicate}>
      <Icon name="copy" size={12} /><span>Duplicar</span>
    </button>
    <button
      type="button"
      title="Mover las piezas de la capa activa a la principal y borrarla"
      disabled={activeId === 'principal'}
      onclick={mergeIntoPrincipal}><Icon name="merge" size={12} /><span>Fusionar</span></button
    >
    <button type="button" title="Ocultar las demás capas" onclick={isolate}>
      <Icon name="isolate" size={12} /><span>Aislar</span>
    </button>
    <button type="button" title="Mostrar todas las capas" onclick={showAll}>
      <Icon name="eye" size={12} /><span>Ver todas</span>
    </button>
    <button type="button" title="Atenuar las demás capas" class:on={dim} onclick={toggleDim}>
      <Icon name="eye" size={12} /><span>{dim ? 'Atenuando' : 'Atenuar'}</span>
    </button>
    <button
      type="button"
      title="Seleccionar todas las piezas de la capa activa"
      onclick={selectAll}
    >
      <Icon name="grid" size={12} /><span>Seleccionar todo</span>
    </button>
  </div>
</aside>

<style>
  /* En flujo dentro de `.left-rail`: comparte columna con la paleta en vez de flotar encima
     de ella. Así no hay dos cajas absolutas peleándose por el mismo `left`. */
  .layers {
    flex: 0 0 auto;
    min-height: 0;
    width: 100%;
    max-height: 45%;
    overflow-y: auto;
    padding: 0.45rem;
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    color: var(--fg);
    font-size: 0.78rem;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  header {
    position: sticky;
    top: -0.45rem;
    z-index: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: -0.45rem -0.45rem 0.3rem;
    padding: 0.45rem 0.45rem 0.25rem;
    background: color-mix(in srgb, var(--panel-bg) 96%, transparent);
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: 0.1rem;
  }

  header button,
  .vis,
  .lock,
  .use,
  .move,
  .del {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    padding: 0;
    font: inherit;
    line-height: 1;
  }

  header button {
    width: 1.5rem;
    height: 1.5rem;
  }

  header button:hover:not(:disabled),
  .vis:hover,
  .lock:hover,
  .use:hover,
  .move:hover,
  .del:hover {
    background: var(--panel-bg-hover);
    color: var(--fg);
  }

  header button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .vis.off {
    color: var(--wc-error);
  }

  .lock.on {
    color: var(--wc-state-one);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  /* Cada capa ocupa dos líneas: nombre y borrar arriba; visibilidad, candado y «mover aquí»
     abajo. En una sola línea no cabían y los iconos se apiñaban contra el nombre. */
  li {
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
    padding: 0.3rem;
    border: 1px solid transparent;
    border-radius: 0.35rem;
  }

  li.active {
    border-color: color-mix(in srgb, var(--wc-selection) 35%, transparent);
    background: color-mix(in srgb, var(--wc-selection) 12%, transparent);
  }

  .layer-main {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .layer-main .use,
  .layer-main .del {
    flex: 0 0 1.5rem;
    width: 1.5rem;
    height: 1.5rem;
  }

  .use {
    color: var(--fg-muted);
  }

  .use.on {
    color: var(--wc-selection);
  }

  li input {
    flex: 1 1 auto;
    min-width: 0;
    height: 1.6rem;
    padding: 0.1rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.74rem;
    box-sizing: border-box;
  }

  .layer-main .del {
    margin-left: auto;
  }

  .del:hover {
    color: var(--wc-error);
  }

  .layer-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    padding-left: 0.1rem;
  }

  .tool {
    display: inline-flex;
    align-items: center;
    gap: 0.12rem;
    color: var(--fg-muted);
    font-size: 0.62rem;
  }

  .tool .vis,
  .tool .lock {
    width: 1.35rem;
    height: 1.35rem;
  }

  .layer-tools .move {
    gap: 0.15rem;
    height: 1.4rem;
    margin-left: auto;
    padding: 0 0.25rem;
    border: 1px solid var(--border);
    font-size: 0.62rem;
    white-space: nowrap;
  }

  .ops {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.2rem;
    margin-top: 0.4rem;
  }

  .ops button {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    min-width: 0;
    min-height: 1.6rem;
    padding: 0.18rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    background: var(--panel-bg);
    color: inherit;
    font: inherit;
    font-size: 0.65rem;
    text-align: left;
    cursor: pointer;
  }

  .ops button span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ops button:hover:not(:disabled) {
    background: var(--panel-bg-hover);
  }

  .ops button:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
