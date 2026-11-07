<script lang="ts">
  import { onMount } from 'svelte'
  import type { Editor } from './editor'
  import { t } from './i18n'

  let { editor, onClose, extra = [] }: {
    editor: Editor | null
    onClose: () => void
    extra?: readonly { readonly label: string; readonly action: () => void }[]
  } = $props()
  let query = $state('')
  let inputEl = $state<HTMLInputElement | null>(null)

  const baseCommands = [
    { label: 'Agrupar cables en bus', action: () => editor?.groupSelection() },
    { label: 'Desagrupar bus', action: () => editor?.ungroupSelection() },
    { label: 'Rotar selección', action: () => editor?.rotateSelection(true) },
    { label: t('cmd.duplicate'), action: () => editor?.duplicate() },
    { label: 'Borrar selección', action: () => editor?.removeSelected() },
    { label: t('cmd.paste'), action: () => editor?.paste() },
    { label: t('cmd.zoomFit'), action: () => editor?.fitToContent() },
    { label: t('cmd.exportPng'), action: () => editor?.exportPng() },
    { label: 'Vaciar lienzo', action: () => editor?.clear() },
    { label: 'Encender/apagar corriente', action: () => editor?.setPowered(!editor?.isPowered) },
  ]
  const commands = $derived([...baseCommands, ...extra])
  const filtered = $derived(
    query.trim() === ''
      ? commands
      : commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())),
  )

  // Foco al abrir, sin `autofocus` (que la accesibilidad marca como mala práctica).
  onMount(() => inputEl?.focus())
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div class="backdrop" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="presentation">
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-label="Paleta de comandos"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <input bind:this={inputEl} placeholder="Buscar comando..." bind:value={query} />
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
