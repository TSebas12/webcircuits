<script lang="ts">
  import type { Editor } from './editor'
  import type { Layer } from '../core/model/types'
  let { editor }: { editor: Editor | null } = $props()
  let layers = $state<Layer[]>([])

  const refresh = () => {
    if (!editor) return
    layers = [...editor.diagram.layersList]
  }

  import { onMount } from 'svelte'
  onMount(() => {
    refresh()
    const t = setInterval(refresh, 300)
    return () => clearInterval(t)
  })

  const create = () => { editor?.diagram.createLayer(); refresh() }
  const rename = (id: string, name: string) => editor?.diagram.renameLayer(id, name)
  const remove = (id: string) => { editor?.diagram.deleteLayer(id); refresh() }
  const toggleVis = (id: string, v: boolean) => editor?.diagram.setLayerVisible(id, v)
  const toggleLock = (id: string, v: boolean) => editor?.diagram.setLayerLocked(id, v)
</script>

<aside class="layers" aria-label="Capas">
  <header>
    <span>Capas</span>
    <button type="button" onclick={create}>+</button>
  </header>
  <ul>
    {#each layers as layer (layer.id)}
      <li>
        <button type="button" class="vis" onclick={() => toggleVis(layer.id, !layer.visible)}>{layer.visible ? '👁' : '—'}</button>
        <button type="button" class="lock" onclick={() => toggleLock(layer.id, !layer.locked)}>{layer.locked ? '🔒' : '🔓'}</button>
        <input value={layer.name} onblur={(e) => rename(layer.id, (e.target as HTMLInputElement).value)} />
        {#if layer.id !== 'principal'}
          <button type="button" class="del" onclick={() => remove(layer.id)}>×</button>
        {/if}
      </li>
    {/each}
  </ul>
</aside>

<style>
  .layers {
    position: absolute;
    left: 0.6rem;
    top: 6rem;
    width: 12rem;
    padding: 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    z-index: 8;
    font-size: 0.8rem;
  }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; font-weight: 600 }
  header button { border: 1px solid var(--border); background: transparent; cursor: pointer; border-radius: 0.25rem; padding: 0 0.4rem }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.2rem }
  li { display: flex; align-items: center; gap: 0.2rem }
  li input { flex: 1; border: 1px solid var(--border); border-radius: 0.2rem; padding: 0.1rem 0.3rem; background: var(--bg); color: var(--fg); font-size: 0.75rem }
  .vis, .lock, .del { border: none; background: transparent; cursor: pointer; padding: 0 0.2rem }
</style>