<script lang="ts">
  import { t } from '../../i18n'
  import { ComponentRunner } from '../../scripting/component-runner'
  import { PythonRunner } from '../../scripting/runner'

  let { onClose }: { onClose: () => void } = $props()

  let code = $state("def compute(inputs):\n    # Ejemplo: AND de 2 entradas\n    return [inputs[0] and inputs[1]]\n")
  let output = $state('')
  let running = $state(false)
  let mode = $state<'script' | 'component'>('component')

  function run(): void {
    running = true
    output = ''
    if (mode === 'component') {
      const runner = new ComponentRunner(
        () =>
          new Worker(new URL('../../../worker/python-worker.ts', import.meta.url), {
            type: 'module',
          }),
      )
      runner
        .run(code, {
          inputs: [0, 1],
          spec: { id: 'comp_0', inputCount: 2, outputCount: 1 },
        })
        .then((res) => {
          output = res.ok ? res.stdout : (res.error ?? 'error')
        })
        .finally(() => {
          running = false
        })
      return
    }

    const runner = new PythonRunner(
      () =>
        new Worker(new URL('../../../worker/python-worker.ts', import.meta.url), {
          type: 'module',
        }),
      5000,
    )
    runner
      .run(code)
      .then((res) => {
        output = res.ok ? res.stdout : (res.error ?? 'error')
      })
      .finally(() => {
        running = false
      })
  }
</script>

<div class="panel">
  <header>
    <h2>{t('script.title')}</h2>
    <select bind:value={mode} aria-label="Modo">
      <option value="component">Componente</option>
      <option value="script">Script libre</option>
    </select>
    <button type="button" onclick={onClose}>{t('common.close')}</button>
  </header>
  <textarea bind:value={code} spellcheck="false"></textarea>
  <div class="actions">
    <button type="button" onclick={run} disabled={running}>{t('script.run')}</button>
  </div>
  <pre class="output">{output}</pre>
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem; min-width: 24rem; }
  textarea { min-height: 12rem; font-family: monospace; }
  pre { background: var(--bg, #f5f5f5); padding: 0.5rem; min-height: 4rem; white-space: pre-wrap; }
</style>