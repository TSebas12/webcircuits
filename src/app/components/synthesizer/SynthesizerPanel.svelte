<script lang="ts">
  import { booleanFunction } from '../../../core/synthesis/function'
  import { minimize } from '../../../core/synthesis/minimize'
  import type { Netlist } from '../../../core/synthesis/netlist'
  import { synthesizeNetlist } from '../../../core/synthesis/netlist'
  import { createFileProvider } from '../../files/provider-factory'
  import { netlistToVerilog } from '../../../core/hdl/netlist-verilog'

  let { onClose }: { onClose: () => void } = $props()

  let outputsText = $state('0, 1, 1, 0')
  let error = $state<string | null>(null)
  let expression = $state('')
  let nodeCount = $state(0)
  let lastNetlist = $state<Netlist | null>(null)

  async function exportVerilog(): Promise<void> {
    if (!lastNetlist) return
    const provider = createFileProvider()
    await provider.save(netlistToVerilog(lastNetlist), 'synthesized.sv')
  }

  function generate(): void {
    error = null
    expression = ''
    nodeCount = 0
    try {
      const outputs = outputsText
        .split(/[,\s]+/)
        .filter((s) => s.length > 0)
        .map((s) => {
          const v = Number(s)
          if (v !== 0 && v !== 1) throw new Error('solo 0/1')
          return v
        })
      if (outputs.length < 2) throw new Error('mínimo 2 salidas')
      const inputCount = Math.log2(outputs.length)
      if (!Number.isInteger(inputCount)) throw new Error('el número de salidas debe ser potencia de 2')
      const fn = booleanFunction(inputCount, outputs, Array.from({ length: inputCount }, (_, i) => `x${i + 1}`))
      const mf = minimize(fn)
      const nl = synthesizeNetlist(fn, mf)
      expression = mf.expression
      nodeCount = nl.nodes.length
      lastNetlist = nl
    } catch (e) {
      error = e instanceof Error ? e.message : 'error'
    }
  }
</script>

<div class="backdrop" role="dialog" aria-modal="true">
  <div class="panel">
    <header>
      <h2>Sintetizador (M8B)</h2>
      <button type="button" onclick={onClose}>Cerrar</button>
    </header>
    <label>
      Salidas (0/1 separadas por comas)
      <input bind:value={outputsText} />
    </label>
    <button type="button" onclick={generate}>Generar</button>
    {#if lastNetlist}
      <button type="button" onclick={() => void exportVerilog()}>Exportar Verilog</button>
    {/if}
    {#if error}
      <p class="err">{error}</p>
    {/if}
    {#if expression}
      <p class="result">Expresión: {expression}</p>
      <p class="result">Nodos: {nodeCount}</p>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: grid;
    place-items: center;
    z-index: 50;
  }
  .panel {
    background: var(--wc-bg, #fff);
    padding: 1rem;
    border-radius: 0.5rem;
    min-width: 24rem;
  }
  .err { color: #c00; }
  .result { font-family: monospace; }
</style>