<script lang="ts">
  import Modal from './common/Modal.svelte'
  import { t } from '../i18n'
  import { truthTableToCsv, truthTableToHtml } from '../../core/truthtable/generate'
  import { createFileProvider } from '../files/provider-factory'
  import type { TruthTable } from '../../core/truthtable/truth-state'

  let {
    open = false,
    table,
    onClose,
  }: {
    open?: boolean
    table?: TruthTable | null
    onClose?: () => void
  } = $props()

  async function exportCsv(): Promise<void> {
    if (!table) return
    const provider = createFileProvider()
    await provider.save(truthTableToCsv(table), 'truth-table.csv')
  }

  async function exportHtml(): Promise<void> {
    if (!table) return
    const provider = createFileProvider()
    await provider.save(truthTableToHtml(table), 'truth-table.html')
  }
</script>

{#snippet footerWithTable()}
  <div class="actions">
    <button onclick={exportCsv}>{t('dialog.truthTable.exportCsv')}</button>
    <button onclick={exportHtml}>{t('dialog.truthTable.exportHtml')}</button>
    <button type="button" onclick={() => onClose?.()}>{t('common.close')}</button>
  </div>
{/snippet}

{#snippet footerWithoutTable()}
  <div class="actions">
    <button type="button" onclick={() => onClose?.()}>{t('common.close')}</button>
  </div>
{/snippet}

<Modal open={open} title={t('dialog.truthTable.title')} onClose={() => onClose?.()} footer={table ? footerWithTable : footerWithoutTable}>
  {#if table}
    <div class="tt-container">
      <div class="tt-header">
        <span>{t('dialog.truthTable.inputs').replace('{count}', String(table.inputs.length))}</span>
        <span>{t('dialog.truthTable.outputs').replace('{count}', String(table.outputs.length))}</span>
        <span>{t('dialog.truthTable.rows').replace('{count}', String(table.rows.length))}</span>
      </div>
      <table class="tt-table">
        <thead>
          <tr>
            {#each table.inputs as input, i (i)}
              <th>{input.name}</th>
            {/each}
            {#each table.outputs as output, i (i)}
              <th>{output.name}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each table.rows as row, ri (ri)}
            <tr>
              {#each row.input as val, i (i)}
                <td>{val.toString(16).toUpperCase()}</td>
              {/each}
              {#each row.output as val, i (i)}
                <td>{val.toString(16).toUpperCase()}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <p>{t('dialog.truthTable.noData')}</p>
  {/if}
</Modal>

<style>
  .tt-container { max-height: 60vh; overflow: auto; }
  .tt-header { display: flex; gap: 1rem; font-size: 0.8rem; color: var(--fg-muted); margin-bottom: 0.5rem; }
  .tt-table { border-collapse: collapse; font-size: 0.75rem; }
  .tt-table th, .tt-table td {
    border: 1px solid var(--border);
    padding: 0.2rem 0.4rem;
    text-align: right;
  }
  .tt-table th { background: var(--panel-bg); }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  button { padding: 0.35rem 0.7rem; }
  button.primary { font-weight: 600; }
</style>