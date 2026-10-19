<script lang="ts">
  import type { Editor } from './editor'
  let { editor, onClose }: { editor: Editor | null; onClose: () => void } = $props()
  let query = $state('')
  const commands = [
    { label: 'Rotar selección', action: () => editor?.rotateSelection(true) },
    { label: 'Duplicar', action: () => editor?.duplicate() },
    { label: 'Borrar selección', action: () => editor?.removeSelected() },
    { label: 'Pegar', action: () => editor?.paste() },
    { label: 'Zoom to fit', action: () => editor?.fitToContent() },
    { label: 'Vaciar lienzo', action: () => editor?.clear() },
    { label: 'Encender/apagar corriente', action: () => editor?.setPowered(!editor?.isPowered) },
  ]
  const filtered = $derived(
    query.trim() === ''
      ? commands
      : commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
  )
</script>

<div class="backdrop" onclick={onClose} role="presentation">
  <div class="panel" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Paleta de comandos">
    <input autofocus placeholder="Buscar comando..." bind:value={query} />
    <ul>
      {#each filtered as c (c.label)}
        <li>
          <button type="button" onclick={() => { c.action(); onClose() }}>{c.label}</button>
        </li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh; z-index: 60 }
  .panel { background: var(--panel-bg); border: 1px solid var(--border); border-radius: 0.5rem; width: 28rem; max-height: 60vh; overflow: auto; padding: 0.5rem }
  input { width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 0.3rem; background: var(--bg); color: var(--fg); margin-bottom: 0.4rem }
  ul { list-style: none; margin: 0; padding: 0 }
  button { width: 100%; text-align: left; padding: 0.4rem 0.6rem; border: none; background: transparent; color: var(--fg); cursor: pointer; border-radius: 0.25rem }
  button:hover { background: var(--panel-bg-hover) }
</style>