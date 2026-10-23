<script lang="ts">
  import { onMount } from 'svelte'
  import type { Editor } from './editor'
  import type { Element, PinSide, StoredElement } from '../core/model/types'
  import { SENSOR_TYPES } from '../core/model/sensor'
  import { LIGHT_THEME } from '../core/theme/presets'
  let { editor }: { editor: Editor | null } = $props()
  let selected = $state<Element | null>(null)
  /** Copias reactivas de lo que el editor no puede avisar por sí solo (no es un store). */
  let selectedCount = $state(0)
  let busGroupWidth = $state(0)
  let busGroupId = $state<string | null>(null)
  let busGroupName = $state('')
  let busGroupCollapsed = $state(true)
  let busValues = $state<readonly (number | null)[]>([])
  let canGroup = $state(false)

  /** Cómo se llama cada tipo de sensor en la interfaz. */
  const SENSOR_LABELS: Readonly<Record<string, string>> = {
    series: 'Serie',
    loop: 'Serie en bucle',
    random: 'Aleatorio',
    manual: 'Manual',
    keycode: 'Código de tecla',
    ascii: 'ASCII',
    sequence: 'Secuencia',
    clock: 'Reloj',
  }

  /** Cómo se llama cada tipo de elemento en la interfaz. */
  const KIND_LABELS: Readonly<Record<string, string>> = {
    gate: 'Compuerta',
    button: 'Interruptor',
    pin: 'Pin de la hoja',
    constant: 'Constante',
    probe: 'Sonda',
    sensor: 'Sensor',
    memory: 'Memoria',
    splitter: 'Repartidor',
    circuit: 'Subcircuito',
    wire: 'Cable',
  }

  /** El nombre concreto de una compuerta: «Compuerta AND», «LED», «7 segmentos»… */
  const kindLabel = (element: Element): string => {
    if (element.kind !== 'gate') {
      return KIND_LABELS[element.kind] ?? element.kind
    }
    const gates: Readonly<Record<string, string>> = {
      and: 'AND',
      or: 'OR',
      xor: 'XOR',
      not: 'NOT',
      clock: 'Reloj',
      triState1: 'Tri-estado ↓',
      triState2: 'Tri-estado ↑',
    }
    if (element.gateType === 'led') {
      return element.inputCount === 8 ? '7 segmentos' : 'LED'
    }
    return `Compuerta ${gates[element.gateType] ?? element.gateType}`
  }

  const refresh = () => {
    if (editor === null) {
      selected = null
      selectedCount = 0
      busGroupWidth = 0
      busGroupId = null
      busGroupName = ''
      busGroupCollapsed = true
      busValues = []
      canGroup = false
      return
    }
    const id = editor.selectedId
    selected = (id ? (editor.diagram.get(id) ?? null) : null) as Element | null
    selectedCount = editor.selectedCount
    const group = editor.selectedBusGroup
    const groupId = group?.id ?? null
    if (groupId !== busGroupId) {
      busGroupId = groupId
      busGroupName = group?.name ?? ''
    }
    busGroupCollapsed = group?.collapsed ?? true
    busValues = group === null ? [] : editor.busGroupValues(group.id)
    busGroupWidth = group?.wireIds.length ?? 0
    canGroup = editor.canGroupSelection
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
   */
  function themeWire(): string {
    const fallback = LIGHT_THEME.tokens['wire.idle']
    if (typeof document === 'undefined') {
      return fallback
    }
    const value = getComputedStyle(document.documentElement).getPropertyValue('--wc-wire').trim()
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
  }

  onMount(() => {
    const t = setInterval(refresh, 200)
    return () => clearInterval(t)
  })
</script>

{#if selectedCount > 1}
  <aside class="inspector" aria-label="Propiedades">
    <header class="inspector-head">
      <h3>Propiedades ({selectedCount})</h3>
      <p class="kind">Selección múltiple</p>
    </header>
    {#if busGroupWidth > 0}
      <label class="field">
        <span>Nombre</span>
        <input
          type="text"
          maxlength="32"
          value={busGroupName}
          oninput={(e) => {
            const value = (e.currentTarget as HTMLInputElement).value
            busGroupName = value
            editor?.renameBusGroup(value)
          }}
        />
      </label>
      <p class="hint">
        Rango [{busGroupWidth - 1}:0]. La etiqueta muestra el valor real al simular; sin
        corriente usa <code>z</code>. {busGroupCollapsed
          ? 'Plegado se ve como una sola línea.'
          : 'Desplegado se ven sus cables de un bit.'}
      </p>
      <p class="section-title">Bits</p>
      <div class="bus-bits" aria-label="Valores de los bits del bus">
        {#each busValues as value, bit (bit)}
          <div
            class="bus-bit"
            class:one={value === 1}
            class:zero={value === 0}
            class:floating={value === null}
          >
            <span class="bus-bit-index">b{bit}</span>
            <span class="bus-bit-value">{value === null ? 'z' : value}</span>
          </div>
        {/each}
      </div>
      <div class="actions">
        <button
          type="button"
          onclick={() => {
            if (busGroupId !== null) {
              editor?.setBusGroupCollapsed(busGroupId, !busGroupCollapsed)
            }
            refresh()
          }}>{busGroupCollapsed ? 'Desplegar bus' : 'Plegar bus'}</button
        >
        <button
          type="button"
          onclick={() => {
            editor?.ungroupSelection()
            refresh()
          }}>Desagrupar bus</button
        >
      </div>
    {:else}
      <label class="field">
        <span>Bits</span>
        <input
          type="number"
          min="1"
          max="32"
          oninput={(e) =>
            editor?.updateSelection({
              bitWidth: Number((e.currentTarget as HTMLInputElement).value),
            })}
        />
      </label>
      <div class="actions">
        <button
          type="button"
          onclick={() => {
            editor?.updateSelection({})
            refresh()
          }}>Aplicar a todos</button
        >
        {#if canGroup}
          <button
            type="button"
            onclick={() => {
              editor?.groupSelection()
              refresh()
            }}>Agrupar en bus</button
          >
        {/if}
      </div>
    {/if}
  </aside>
{:else if selected}
  <aside class="inspector" aria-label="Propiedades">
    <header class="inspector-head">
      <h3>Propiedades</h3>
      <p class="kind">{kindLabel(selected)}</p>
    </header>

    {#if selected.kind === 'gate'}
      <p class="section-title">General</p>
      <label class="field">
        <span>Bits</span>
        <input
          type="number"
          min="1"
          max="32"
          value={selected.bitWidth ?? 1}
          oninput={(e) => update({ bitWidth: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
      <p class="section-title">Compuerta</p>
      <label class="field">
        <span>Entradas</span>
        <input
          type="number"
          min="1"
          max="32"
          value={selected.inputCount}
          oninput={(e) =>
            update({ inputCount: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
      <label class="field toggle">
        <span>Salida invertida</span>
        <input
          type="checkbox"
          checked={selected.invertedOutput}
          onchange={(e) =>
            update({ invertedOutput: (e.currentTarget as HTMLInputElement).checked })}
        />
      </label>
      <label class="field">
        <span>Retardo (ms)</span>
        <input
          type="number"
          min="0"
          max="1000"
          value={selected.delay ?? 0}
          oninput={(e) => update({ delay: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
    {:else if selected.kind === 'button'}
      <p class="section-title">Interruptor</p>
      <label class="field">
        <span>Bits</span>
        <input
          type="number"
          min="1"
          max="32"
          value={selected.bitWidth ?? 1}
          oninput={(e) => update({ bitWidth: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
      <label class="field toggle">
        <span>Fijo</span>
        <input
          type="checkbox"
          checked={selected.isToggle}
          onchange={(e) => update({ isToggle: (e.currentTarget as HTMLInputElement).checked })}
        />
      </label>
      <label class="field toggle">
        <span>Invertido</span>
        <input
          type="checkbox"
          checked={selected.inverted}
          onchange={(e) => update({ inverted: (e.currentTarget as HTMLInputElement).checked })}
        />
      </label>
    {:else if selected.kind === 'pin'}
      <p class="section-title">Pin</p>
      <div class="field">
        <span>Dirección</span><span class="value"
          >{selected.pinType === 'input' ? 'Entrada' : 'Salida'}</span
        >
      </div>
      <div class="field"><span>Lado</span><span class="value">{selected.side}</span></div>
      <label class="field">
        <span>Bits</span>
        <input
          type="number"
          min="1"
          max="32"
          value={selected.bitWidth}
          oninput={(e) => update({ bitWidth: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
      {#if selected.name !== ''}<div class="field">
          <span>Nombre</span><span class="value">{selected.name}</span>
        </div>{/if}
    {:else if selected.kind === 'constant'}
      <p class="section-title">Constante</p>
      <label class="field">
        <span>Valor</span>
        <input
          type="number"
          value={selected.value}
          oninput={(e) => update({ value: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
      <label class="field">
        <span>Bits</span>
        <input
          type="number"
          min="1"
          max="32"
          value={selected.bitWidth}
          oninput={(e) => update({ bitWidth: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
    {:else if selected.kind === 'probe'}
      <p class="section-title">Sonda</p>
      <label class="field">
        <span>Entrada</span>
        <select
          value={selected.pinSide}
          onchange={(e) =>
            update({ pinSide: (e.currentTarget as HTMLSelectElement).value as PinSide })}
        >
          <option value="left">Izquierda</option>
          <option value="top">Arriba</option>
          <option value="right">Derecha</option>
          <option value="bottom">Abajo</option>
        </select>
      </label>
      <label class="field">
        <span>Nombre</span>
        <input
          value={selected.name === selected.id ? '' : selected.name}
          placeholder="Sonda"
          oninput={(e) =>
            update({
              name: (e.currentTarget as HTMLInputElement).value.trim() || selected?.id || '',
            })}
        />
      </label>
    {:else if selected.kind === 'sensor'}
      <p class="section-title">Sensor</p>
      <label class="field">
        <span>Tipo</span>
        <select
          value={selected.sensorType}
          onchange={(e) => update({ sensorType: (e.currentTarget as HTMLSelectElement).value })}
        >
          {#each SENSOR_TYPES as type (type)}
            <option value={type}>{SENSOR_LABELS[type] ?? type}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Bits</span>
        <input
          type="number"
          min="1"
          max="32"
          value={selected.bitWidth}
          oninput={(e) => update({ bitWidth: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
      <label class="field">
        <span>Salida</span>
        <select
          value={selected.pinSide}
          onchange={(e) =>
            update({ pinSide: (e.currentTarget as HTMLSelectElement).value as PinSide })}
        >
          <option value="left">Izquierda</option>
          <option value="top">Arriba</option>
          <option value="right">Derecha</option>
          <option value="bottom">Abajo</option>
        </select>
      </label>
      <label class="field">
        <span>Notación</span>
        <input
          value={selected.notation}
          placeholder="Opcional"
          oninput={(e) => update({ notation: (e.currentTarget as HTMLInputElement).value })}
        />
      </label>
      {#if selected.sensorType === 'series' || selected.sensorType === 'loop' || selected.sensorType === 'random' || selected.sensorType === 'manual'}
        <label class="field">
          <span>Datos</span>
          <input
            value={selected.data}
            placeholder={selected.sensorType === 'random' ? 'A:14' : '0:0'}
            oninput={(e) => update({ data: (e.currentTarget as HTMLInputElement).value })}
          />
        </label>
      {/if}
    {:else if selected.kind === 'memory'}
      <p class="section-title">Memoria</p>
      <label class="field">
        <span>Bits de dirección</span>
        <input
          type="number"
          min="1"
          max="32"
          value={selected.addressBitWidth}
          oninput={(e) =>
            update({ addressBitWidth: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
      <label class="field">
        <span>Bits de datos</span>
        <input
          type="number"
          min="1"
          max="32"
          value={selected.dataBitWidth}
          oninput={(e) =>
            update({ dataBitWidth: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
      <label class="field">
        <span>Tipo</span>
        <select
          value={selected.isRom ? 'rom' : 'ram'}
          onchange={(e) =>
            update({ isRom: (e.currentTarget as HTMLSelectElement).value === 'rom' })}
        >
          <option value="ram">RAM</option>
          <option value="rom">ROM</option>
        </select>
      </label>
    {:else if selected.kind === 'splitter'}
      <p class="section-title">Repartidor</p>
      <label class="field">
        <span>Bits totales</span>
        <input
          type="number"
          min="1"
          max="32"
          value={selected.bitWidth}
          oninput={(e) => update({ bitWidth: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
      <label class="field">
        <span>Salidas</span>
        <input
          type="number"
          min="1"
          max="32"
          value={selected.pinCount}
          oninput={(e) => update({ pinCount: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
      <label class="field toggle">
        <span>Sentido horario</span>
        <input
          type="checkbox"
          checked={selected.clockwise}
          onchange={(e) => update({ clockwise: (e.currentTarget as HTMLInputElement).checked })}
        />
      </label>
    {:else if selected.kind === 'circuit'}
      <p class="section-title">Subcircuito</p>
      <div class="field">
        <span>Circuito</span><span class="value"
          >{editor?.project.circuit(selected.targetCircuitId)?.name ?? '?'}</span
        >
      </div>
    {/if}

    {#if 'position' in selected}
      <p class="section-title">Posición</p>
      <label class="field">
        <span>X</span>
        <input
          type="number"
          value={(selected as { position: { x: number; y: number } }).position.x}
          oninput={(e) =>
            update({
              position: {
                x: Number((e.currentTarget as HTMLInputElement).value),
                y: (selected as { position: { x: number; y: number } }).position.y,
              },
            })}
        />
      </label>
      <label class="field">
        <span>Y</span>
        <input
          type="number"
          value={(selected as { position: { x: number; y: number } }).position.y}
          oninput={(e) =>
            update({
              position: {
                x: (selected as { position: { x: number; y: number } }).position.x,
                y: Number((e.currentTarget as HTMLInputElement).value),
              },
            })}
        />
      </label>
    {/if}

    {#if selected.kind === 'wire'}
      <p class="section-title">Cable</p>
      <div class="field">
        <span>De</span><span class="value">{selected.p1.x},{selected.p1.y}</span>
      </div>
      <div class="field">
        <span>A</span><span class="value">{selected.p2.x},{selected.p2.y}</span>
      </div>
      <label class="field color-field">
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
          class="theme-color"
          onclick={() => {
            editor?.setSelectedWireColor(null)
            refresh()
          }}>Usar el color del tema</button
        >
      {/if}
    {/if}

    <div class="actions">
      {#if selected.kind !== 'wire'}
        <button
          type="button"
          onclick={() => {
            editor?.rotateSelection(true)
            refresh()
          }}>Rotar 90°</button
        >
      {/if}
      {#if selected.kind === 'circuit'}
        <button type="button" onclick={openSelected}>Abrir subcircuito</button>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .inspector {
    position: absolute;
    right: 0.6rem;
    /* Debajo del aviso de modo y de la barra: así no comparten esquina ni se tapan. */
    top: 9.6rem;
    width: 18rem;
    max-height: calc(100% - 16.1rem);
    overflow-y: auto;
    padding: 0.85rem;
    border: 1px solid var(--border);
    border-radius: 0.6rem;
    background: color-mix(in srgb, var(--panel-bg) 94%, transparent);
    box-shadow: 0 6px 20px rgb(0 0 0 / 18%);
    font-size: 0.82rem;
    z-index: 8;
    backdrop-filter: blur(6px);
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .inspector-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    padding-bottom: 0.45rem;
    border-bottom: 1px solid var(--border);
  }
  .inspector h3 {
    margin: 0;
    font-size: 0.98rem;
    font-weight: 700;
  }
  .kind {
    margin: 0;
    overflow: hidden;
    color: var(--fg-muted);
    font-size: 0.7rem;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .section-title {
    margin: 0.65rem 0 0.15rem;
    padding-top: 0.45rem;
    border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    color: var(--fg-muted);
    font-size: 0.63rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .section-title:first-of-type {
    margin-top: 0.3rem;
    padding-top: 0;
    border-top: 0;
  }
  .hint {
    margin: 0.35rem 0 0;
    color: var(--fg-muted);
    font-size: 0.74rem;
    line-height: 1.35;
  }
  /* Todas las filas miden lo mismo: antes las casillas de verificación ocupaban 20 px y los
     campos 28 px, así que la columna parecía hecha con piezas de otro sitio. */
  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem;
    min-height: 2.05rem;
    margin: 0.15rem 0;
  }
  .field > span:first-child {
    min-width: 0;
    color: var(--fg-muted);
    font-size: 0.76rem;
    font-weight: 600;
  }
  .field.toggle {
    cursor: pointer;
  }
  .field input:not([type='checkbox']):not([type='color']),
  .field select {
    flex: 0 0 9rem;
    width: 9rem;
    height: 1.9rem;
    min-width: 0;
    padding: 0.15rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
    box-sizing: border-box;
  }
  .field input[type='checkbox'] {
    flex: 0 0 auto;
    width: 1.05rem;
    height: 1.05rem;
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .value {
    flex: 0 1 auto;
    overflow: hidden;
    color: var(--fg);
    font-size: 0.78rem;
    font-weight: 600;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .color-field input[type='color'] {
    flex: 0 0 2.8rem;
    width: 2.8rem;
    height: 1.9rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    background: transparent;
    cursor: pointer;
  }
  .bus-bits {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.25rem;
    margin-top: 0.3rem;
  }
  .bus-bit {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.2rem;
    padding: 0.2rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    font-variant-numeric: tabular-nums;
  }
  .bus-bit-index {
    color: var(--fg-muted);
    font-size: 0.65rem;
  }
  .bus-bit-value {
    font-size: 0.75rem;
    font-weight: 700;
  }
  .bus-bit.one {
    border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
  }
  .bus-bit.zero {
    background: color-mix(in srgb, var(--fg-muted) 8%, transparent);
  }
  .bus-bit.floating {
    border-style: dashed;
    color: var(--fg-muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.65rem;
    padding-top: 0.55rem;
    border-top: 1px solid var(--border);
  }
  .inspector button {
    margin: 0;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--panel-bg);
    color: var(--fg);
    cursor: pointer;
    font: inherit;
    font-size: 0.78rem;
  }
  .inspector button:hover {
    background: var(--panel-bg-hover);
  }
  .theme-color {
    width: 100%;
  }
</style>
