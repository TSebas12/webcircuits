<script lang="ts">
  import { onDestroy } from 'svelte'
  import Icon from '../../Icon.svelte'
  import type { Editor } from '../../editor'
  import { truthTableToCsv, truthTableToHtml } from '../../../core/truthtable/generate'
  import { serializeProject } from '../../../core/persist/json'
  import type { TruthTable } from '../../../core/truthtable/truth-state'

  type WorkerResponse =
    | { readonly type: 'progress'; readonly value: number }
    | { readonly type: 'done'; readonly table: TruthTable }
    | { readonly type: 'error'; readonly message: string }

  let { editor, onClose }: { editor: Editor; onClose: () => void } = $props()

  let filter = $state('')
  let invertFilter = $state(false)
  let maxRows = $state(4096)
  let table = $state<TruthTable | null>(null)
  let busy = $state(false)
  let error = $state<string | null>(null)
  let progress = $state(0)
  let copied = $state(false)
  let worker: Worker | null = null

  const circuitName = $derived(editor.project.current.name)

  function stopWorker(): void {
    worker?.terminate()
    worker = null
    busy = false
  }

  const close = (): void => {
    stopWorker()
    onClose()
  }

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close()
  }

  onDestroy(() => {
    worker?.terminate()
    worker = null
  })

  function generate(): void {
    stopWorker()
    error = null
    table = null
    copied = false
    progress = 0
    busy = true
    const limit = Math.max(1, Math.floor(Number(maxRows) || 1))

    try {
      const thread = new Worker(new URL('./truth-table-worker.ts', import.meta.url), {
        type: 'module',
      })
      worker = thread
      thread.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const data = event.data
        if (data.type === 'progress') {
          progress = data.value
          return
        }
        thread.terminate()
        if (worker === thread) worker = null
        busy = false
        progress = 1
        if (data.type === 'error') {
          error = data.message
          return
        }
        table = data.table
        if (data.table.rows.length === 0) {
          error =
            data.table.totalRows === 0
              ? 'El circuito necesita al menos un pin de entrada y uno de salida conectados.'
              : 'Ninguna fila cumple el filtro.'
        }
      }
      thread.onerror = (event: ErrorEvent) => {
        event.preventDefault()
        thread.terminate()
        if (worker === thread) worker = null
        busy = false
        error = event.message || 'El trabajador de la tabla de verdad falló.'
      }
      thread.postMessage({
        project: serializeProject(editor.project),
        maxRows: limit,
        filter,
        invertFilter,
      })
    } catch (cause) {
      stopWorker()
      error = cause instanceof Error ? cause.message : String(cause)
    }
  }

  function cancel(): void {
    stopWorker()
    progress = 0
  }

  function formatValue(value: number, bitWidth: number): string {
    return bitWidth <= 1 ? String(value) : value.toString(16).toUpperCase()
  }

  function download(content: string, extension: string, type: string): void {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${safeName(circuitName)}.${extension}`
    anchor.click()
    // Revocar en el mismo tick cancela la descarga en algunos navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function safeName(name: string): string {
    return (name.trim() || 'tabla-de-verdad').replace(/[^\p{L}\p{N}._-]+/gu, '-')
  }

  function exportCsv(): void {
    if (table !== null) download(truthTableToCsv(table), 'csv', 'text/csv;charset=utf-8')
  }

  function exportHtml(): void {
    if (table !== null) download(truthTableToHtml(table), 'html', 'text/html;charset=utf-8')
  }

  async function copyCsv(): Promise<void> {
    if (table === null) return
    try {
      await navigator.clipboard.writeText(truthTableToCsv(table))
      copied = true
      setTimeout(() => {
        copied = false
      }, 1600)
    } catch {
      error = 'El navegador no permitió copiar al portapapeles.'
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop" role="presentation" onclick={close} onkeydown={(event) => event.key === 'Escape' && close()}>
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-label="Tabla de verdad"
    tabindex="-1"
    onclick={(event) => event.stopPropagation()}
    onkeydown={(event) => event.stopPropagation()}
  >
    <header>
      <div>
        <h2>Tabla de verdad</h2>
        <p class="subtitle">{circuitName}</p>
      </div>
      <button type="button" class="close" onclick={close} aria-label="Cerrar" title="Cerrar"><Icon name="close" size={16} /></button>
    </header>

    <div class="controls">
      <label class="field">
        <span>Filtro</span>
        <input
          type="text"
          bind:value={filter}
          placeholder="A && B"
          spellcheck="false"
          autocomplete="off"
        />
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={invertFilter} />
        <span>Invertir</span>
      </label>
      <label class="field small">
        <span>Máx. filas</span>
        <input type="number" min="1" max="65536" step="1" bind:value={maxRows} />
      </label>
      <button type="button" class="primary" onclick={generate} disabled={busy}>
        {busy ? 'Generando…' : 'Generar'}
      </button>
      <button type="button" onclick={cancel} disabled={!busy}>Detener</button>
    </div>

    <p class="hint">
      Usa los nombres de los pines. Operadores: <code>&amp;&amp;</code>, <code>||</code>,
      <code>!</code>, comparaciones y aritmética entera.
    </p>

    {#if busy}
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
        <span style:width={`${Math.round(progress * 100)}%`}></span>
      </div>
    {/if}

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    {#if table !== null && table.rows.length > 0}
      <div class="summary">
        <span>{table.rows.length} filas</span>
        <span>{table.inputs.length} entradas</span>
        <span>{table.outputs.length} salidas</span>
        {#if table.truncated}
          <span class="warning">Tabla truncada al límite de filas</span>
        {/if}
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr class="groups">
              {#if table.inputs.length > 0}
                <th colspan={table.inputs.length}>Entradas</th>
              {/if}
              {#if table.outputs.length > 0}
                <th colspan={table.outputs.length} class="out">Salidas</th>
              {/if}
            </tr>
            <tr>
              {#each table.inputs as pin (pin.id)}
                <th title={`${pin.name} (${pin.bitWidth} bit${pin.bitWidth === 1 ? '' : 's'})`}>
                  {pin.name}<small>{pin.bitWidth}</small>
                </th>
              {/each}
              {#each table.outputs as pin (pin.id)}
                <th class="out" title={`${pin.name} (${pin.bitWidth} bit${pin.bitWidth === 1 ? '' : 's'})`}>
                  {pin.name}<small>{pin.bitWidth}</small>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each table.rows as row, index (index)}
              <tr>
                {#each table.inputs as pin, column (pin.id)}
                  <td>{formatValue(row.input[column] ?? 0, pin.bitWidth)}</td>
                {/each}
                {#each table.outputs as pin, column (pin.id)}
                  <td class="out">{formatValue(row.output[column] ?? 0, pin.bitWidth)}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <footer>
        <button type="button" onclick={exportCsv}>Exportar CSV</button>
        <button type="button" onclick={exportHtml}>Exportar HTML</button>
        <button type="button" onclick={() => void copyCsv()}>{copied ? 'Copiado' : 'Copiar CSV'}</button>
        <span class="total">Total de combinaciones: {table.totalRows.toLocaleString('es-ES')}</span>
      </footer>
    {:else if !busy && table === null}
      <p class="empty">Pulsa Generar para recorrer todas las combinaciones de los pines de entrada.</p>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgb(0 0 0 / 0.45);
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    width: min(64rem, calc(100vw - 2rem));
    max-height: min(46rem, calc(100vh - 2rem));
    padding: 0.9rem 1rem 1rem;
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    background: var(--panel-bg);
    box-shadow: 0 18px 50px rgb(0 0 0 / 35%);
  }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem }
  h2 { margin: 0; font-size: 1.05rem; font-weight: 600 }
  .subtitle { margin: 0.15rem 0 0; font-size: 0.78rem; color: var(--fg-muted) }
  .close {
    width: 1.8rem;
    height: 1.8rem;
    border: 1px solid transparent;
    border-radius: 0.3rem;
    background: transparent;
    color: var(--fg-muted);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }
  .close:hover { background: var(--panel-bg-hover); color: var(--fg) }
  .controls { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.5rem }
  .field { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.74rem; color: var(--fg-muted) }
  .field input {
    width: 12rem;
    padding: 0.3rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--panel-bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.82rem;
  }
  .field.small input { width: 6.5rem }
  .check { display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; padding-bottom: 0.3rem }
  button {
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 0.32rem;
    background: var(--panel-bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--panel-bg-hover) }
  button:disabled { opacity: 0.5; cursor: default }
  button.primary { border-color: var(--accent, var(--border)); font-weight: 600 }
  .hint { margin: 0; font-size: 0.72rem; color: var(--fg-muted) }
  .hint code { font-size: 0.72rem }
  .progress { height: 0.3rem; overflow: hidden; border-radius: 999px; background: var(--panel-bg-hover) }
  .progress span { display: block; height: 100%; background: var(--accent, var(--fg-muted)); transition: width 120ms linear }
  .error { margin: 0; padding: 0.45rem 0.6rem; border: 1px solid var(--wc-state-one); border-radius: 0.3rem; color: var(--wc-state-one); font-size: 0.8rem }
  .summary { display: flex; flex-wrap: wrap; gap: 0.8rem; font-size: 0.75rem; color: var(--fg-muted) }
  .summary .warning { color: var(--wc-state-one) }
  .table-wrap { flex: 1; min-height: 8rem; overflow: auto; border: 1px solid var(--border); border-radius: 0.35rem }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; font-variant-numeric: tabular-nums }
  th, td { padding: 0.22rem 0.55rem; border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent); text-align: right }
  th { position: sticky; top: 0; z-index: 1; background: var(--panel-bg); font-weight: 600 }
  thead tr:first-child th { top: 0 }
  thead tr:last-child th { top: 1.55rem }
  tr.groups th { padding: 0.3rem 0.55rem; text-align: center; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-muted) }
  th small { display: inline-block; margin-left: 0.3rem; font-size: 0.62rem; font-weight: 400; color: var(--fg-muted) }
  th.out, td.out { background: color-mix(in srgb, var(--accent, var(--border)) 8%, transparent) }
  td.out { font-weight: 600 }
  tbody tr:hover { background: var(--panel-bg-hover) }
  footer { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem }
  .total { margin-left: auto; font-size: 0.72rem; color: var(--fg-muted) }
  .empty { margin: 1.2rem 0; text-align: center; font-size: 0.82rem; color: var(--fg-muted) }
</style>
