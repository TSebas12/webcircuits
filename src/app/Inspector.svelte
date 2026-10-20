<script lang="ts">
  import { onMount } from 'svelte'
  import type { Editor } from './editor'
  import type { Element, PinSide, StoredElement } from '../core/model/types'
  import { LIGHT_THEME } from '../core/theme/presets'
  let { editor }: { editor: Editor | null } = $props()
  let selected = $state<Element | null>(null)

  const refresh = () => {
    if (editor === null) { selected = null; return }
    const id = editor.selectedId
    selected = (id ? (editor.diagram.get(id) ?? null) : null) as Element | null
  }

  const update = (patch: Partial<StoredElement>): void => {
    editor?.updateSelected(patch)
    refresh()
  }

  /** Entra en el subcircuito seleccionado, si lo hay. */
  const openSelected = (): void => {
    if (editor === null || selected === null || selected.kind !== 'circuit') return
    if (editor.enterSubcircuit(selected.targetCircuitId)) {
      editor.fitToContent()
    }
    refresh()
  }

  /**
   * El color de cable del tema actual (M6-14).
   *
   * Se lee del documento porque el selector de color necesita **un** valor concreto: si el
   * cable no tiene color propio, lo justo es enseñar el que le tocaría por el tema.
   */
  function themeWire(): string {
    const fallback = LIGHT_THEME.tokens['wire.idle']
    if (typeof document === 'undefined') {
      return fallback
    }
    const value = getComputedStyle(document.documentElement).getPropertyValue('--wc-wire').trim()
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
  }

  // Poll selection changes (simple; could use onSelectionChange callback)
  onMount(() => {
    const t = setInterval(refresh, 200)
    return () => clearInterval(t)
  })
</script>

{#if (editor?.selectedCount ?? 0) > 1}
  <aside class="inspector" aria-label="Propiedades">
    <h3>Propiedades ({editor?.selectedCount})</h3>
    <div class="row"><span>Selección múltiple</span></div>
    <div class="row">
      <span>Bits</span>
      <input type="number" min="1" max="32"
        oninput={(e) => editor?.updateSelection({ bitWidth: Number((e.currentTarget as HTMLInputElement).value) })} />
    </div>
    <button type="button" onclick={() => { editor?.updateSelection({}); refresh() }}>Aplicar</button>
  </aside>
{:else if selected}
  <aside class="inspector" aria-label="Propiedades">
    <h3>Propiedades</h3>
    <div class="row"><span>Tipo</span><span>{selected.kind}</span></div>
    {#if selected.kind === 'gate'}
      <div class="row">
        <span>Bits</span>
        <input type="number" min="1" max="32" value={selected.bitWidth ?? 1}
          oninput={(e) => update({ bitWidth: Number((e.currentTarget as HTMLInputElement).value) })} />
      </div>
      <div class="row"><span>Entradas</span><span>{selected.inputCount}</span></div>
      <label class="row"><span>Invertido</span><input type="checkbox" checked={selected.invertedOutput} onchange={(e) => update({ invertedOutput: (e.currentTarget as HTMLInputElement).checked })} /></label>
    {:else if selected.kind === 'button'}
      <div class="row">
        <span>Bits</span>
        <input type="number" min="1" max="32" value={selected.bitWidth ?? 1}
          oninput={(e) => update({ bitWidth: Number((e.currentTarget as HTMLInputElement).value) })} />
      </div>
      <label class="row"><span>Fijo</span><input type="checkbox" checked={selected.isToggle} onchange={(e) => update({ isToggle: (e.currentTarget as HTMLInputElement).checked })} /></label>
      <label class="row"><span>Invertido</span><input type="checkbox" checked={selected.inverted} onchange={(e) => update({ inverted: (e.currentTarget as HTMLInputElement).checked })} /></label>
    {:else if selected.kind === 'pin'}
      <div class="row"><span>Dirección</span><span>{selected.pinType === 'input' ? 'entrada' : 'salida'}</span></div>
      <div class="row"><span>Lado</span><span>{selected.side}</span></div>
      <div class="row">
        <span>Bits</span>
        <input type="number" min="1" max="32" value={selected.bitWidth}
          oninput={(e) => update({ bitWidth: Number((e.currentTarget as HTMLInputElement).value) })} />
      </div>
      {#if selected.name !== ''}<div class="row"><span>Nombre</span><span>{selected.name}</span></div>{/if}
    {:else if selected.kind === 'constant'}
      <div class="row">
        <span>Valor</span>
        <input type="number" value={selected.value}
          oninput={(e) => update({ value: Number((e.currentTarget as HTMLInputElement).value) })} />
      </div>
      <div class="row">
        <span>Bits</span>
        <input type="number" min="1" max="32" value={selected.bitWidth}
          oninput={(e) => update({ bitWidth: Number((e.currentTarget as HTMLInputElement).value) })} />
      </div>
    {:else if selected.kind === 'probe'}
      <div class="row">
        <span>Entrada</span>
        <select
          value={selected.pinSide}
          onchange={(e) => update({ pinSide: (e.currentTarget as HTMLSelectElement).value as PinSide })}
        >
          <option value="left">izquierda</option>
          <option value="top">arriba</option>
          <option value="right">derecha</option>
          <option value="bottom">abajo</option>
        </select>
      </div>
      <div class="row">
        <span>Nombre</span>
        <input
          value={selected.name === selected.id ? '' : selected.name}
          placeholder="Sonda"
          oninput={(e) => update({ name: (e.currentTarget as HTMLInputElement).value.trim() || selected?.id || '' })}
        />
      </div>
    {:else if selected.kind === 'splitter'}
      <div class="row">
        <span>Bits</span>
        <input type="number" min="1" max="32" value={selected.bitWidth}
          oninput={(e) => update({ bitWidth: Number((e.currentTarget as HTMLInputElement).value) })} />
      </div>
      <div class="row">
        <span>Salidas</span>
        <input type="number" min="1" max="32" value={selected.pinCount}
          oninput={(e) => update({ pinCount: Number((e.currentTarget as HTMLInputElement).value) })} />
      </div>
      <label class="row"><span>Sentido horario</span><input type="checkbox" checked={selected.clockwise} onchange={(e) => update({ clockwise: (e.currentTarget as HTMLInputElement).checked })} /></label>
    {:else if selected.kind === 'circuit'}
      <div class="row"><span>Circuito</span><span>{editor?.project.circuit(selected.targetCircuitId)?.name ?? '?'}</span></div>
    {/if}
    {#if selected.kind !== 'wire'}
      <button type="button" onclick={() => { editor?.rotateSelection(true); refresh() }}>Rotar 90°</button>
    {/if}
    {#if selected.kind === 'circuit'}
      <button type="button" onclick={openSelected}>Abrir subcircuito</button>
    {/if}
    {#if selected.kind === 'wire'}
      <div class="row"><span>De</span><span>{selected.p1.x},{selected.p1.y}</span></div>
      <div class="row"><span>A</span><span>{selected.p2.x},{selected.p2.y}</span></div>
      <label class="row color-row">
        <span>Color</span>
        <input
          type="color"
          value={selected.color ?? themeWire()}
          title="Color solo para este cable; el resto siguen el tema"
          oninput={(event) => {
            editor?.setSelectedWireColor((event.currentTarget as HTMLInputElement).value)
            refresh()
          }}
        />
      </label>
      {#if selected.color !== undefined}
        <button
          type="button"
          onclick={() => {
            editor?.setSelectedWireColor(null)
            refresh()
          }}
        >Color del tema</button>
      {/if}
    {/if}
    {#if 'position' in selected}
      <div class="row">
        <span>X</span>
        <input type="number" value={(selected as { position: { x: number; y: number } }).position.x}
          oninput={(e) => update({ position: { x: Number((e.currentTarget as HTMLInputElement).value), y: (selected as { position: { x: number; y: number } }).position.y } })} />
      </div>
      <div class="row">
        <span>Y</span>
        <input type="number" value={(selected as { position: { x: number; y: number } }).position.y}
          oninput={(e) => update({ position: { x: (selected as { position: { x: number; y: number } }).position.x, y: Number((e.currentTarget as HTMLInputElement).value) } })} />
      </div>
    {/if}
  </aside>
{/if}

<style>
  .inspector {
    position: absolute;
    right: 0.6rem;
    top: 6rem;
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
  .color-row input {
    width: 2.2rem;
    height: 1.4rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 0.2rem;
    background: transparent;
    cursor: pointer;
  }
  /* (no inputs) */
</style>