<script lang="ts">
  import { onMount } from 'svelte'
  import type { Editor } from './editor'
  import type { Element } from '../core/model/types'
  let { editor }: { editor: Editor | null } = $props()
  let selected = $state<Element | null>(null)

  const refresh = () => {
    if (editor === null) { selected = null; return }
    const id = editor.selectedId
    selected = (id ? (editor.diagram.get(id) ?? null) : null) as Element | null
  }

  // Poll selection changes (simple; could use onSelectionChange callback)
  onMount(() => {
    const t = setInterval(refresh, 200)
    return () => clearInterval(t)
  })
</script>

{#if selected}
  <aside class="inspector" aria-label="Propiedades">
    <h3>Propiedades</h3>
    <div class="row"><span>Tipo</span><span>{selected.kind}</span></div>
    {#if selected.kind === 'gate' || selected.kind === 'button'}
      <div class="row"><span>Bit-width</span><span>{selected.bitWidth ?? 1}</span></div>
      {#if selected.kind === 'gate'}
        <div class="row"><span>Entradas</span><span>{selected.inputCount}</span></div>
        <div class="row"><span>Invertido</span><span>{selected.invertedOutput ? 'sí' : 'no'}</span></div>
      {/if}
      <button type="button" onclick={() => { editor?.rotateSelection(true); refresh() }}>Rotar 90°</button>
    {/if}
    {#if selected.kind === 'wire'}
      <div class="row"><span>De</span><span>{selected.p1.x},{selected.p1.y}</span></div>
      <div class="row"><span>A</span><span>{selected.p2.x},{selected.p2.y}</span></div>
    {/if}
    {#if 'position' in selected}
      <div class="row"><span>Posición</span><span>{(selected as { position: { x: number; y: number } }).position.x}, {(selected as { position: { x: number; y: number } }).position.y}</span></div>
    {/if}
  </aside>
{/if}

<style>
  .inspector {
    position: absolute;
    right: 0.6rem;
    top: 3.5rem;
    width: 14rem;
    padding: 0.6rem;
    border: 1px solid var(--border);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    font-size: 0.8rem;
    z-index: 8;
  }
  .inspector h3 { margin: 0 0 0.4rem; font-size: 0.9rem }
  .row { display: flex; justify-content: space-between; margin: 0.2rem 0 }
  /* (no inputs) */
</style>