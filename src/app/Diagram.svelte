<script lang="ts">
  import { onMount } from 'svelte'
  import { Editor, type Tool } from './editor'

  /**
   * La paleta. Cada botón dice en su `title` la tecla que le toca, que es donde se buscan los
   * atajos; el editor los escucha en su `onKeyDown` y aquí no se repite la tabla.
   */
  const TOOLS: readonly { readonly id: Tool; readonly glyph: string; readonly title: string }[] = [
    { id: 'select', glyph: '⌖', title: 'Seleccionar, mover y cablear (S)' },
    { id: 'erase', glyph: '⌫', title: 'Borrar con un clic lo que se toque (E)' },
    { id: 'button', glyph: '⏻', title: 'Interruptor de entrada (B)' },
    { id: 'and', glyph: '∧', title: 'Compuerta AND (A)' },
    { id: 'led', glyph: '◉', title: 'LED (L)' },
  ]

  let canvasEl = $state<HTMLCanvasElement | null>(null)
  let tool = $state<Tool>('select')
  /** Los dos modos los gobierna la corriente. Arranca apagada, como el original. */
  let powered = $state(false)
  let hasSelection = $state(false)
  let canUndo = $state(false)
  let canRedo = $state(false)
  /** Se está tendiendo un cable: el cursor deja de ser la mano y pasa a ser la flecha. */
  let wiring = $state(false)

  let fps = $state(0)
  let paintMs = $state(0)
  let zoomPct = $state(100)

  /**
   * El editor se crea en `onMount`, así que antes de eso no existe. No es `$state` a
   * propósito: no hay nada que redibujar cuando cambia, solo hay que poder llamarlo.
   */
  let editor: Editor | null = null

  onMount(() => {
    const canvas = canvasEl
    if (canvas === null) {
      return
    }

    const instance = new Editor({
      onStats: (stats) => {
        fps = stats.fps
        paintMs = stats.paintMs
      },
      onZoom: (percent) => {
        zoomPct = percent
      },
      onSelectionChange: (id) => {
        hasSelection = id !== null
      },
      onPoweredChange: (value) => {
        powered = value
      },
      // La herramienta la manda el editor, que también la cambia por su cuenta con `Esc` o con
      // un atajo. Si la fijara sólo el botón, al salir con `Esc` la barra seguiría marcando la
      // vieja.
      onToolChange: (value) => {
        tool = value
      },
      onHistoryChange: (history) => {
        canUndo = history.canUndo
        canRedo = history.canRedo
      },
      onWiringChange: (value) => {
        wiring = value
      },
    })
    editor = instance
    instance.mount(canvas)

    // El editor manda: él sabe con qué corriente, con qué herramienta y con cuánto historial
    // arranca de verdad, así que el estado inicial se lee de ahí y no se duplica aquí.
    powered = instance.isPowered
    tool = instance.currentTool
    canUndo = instance.canUndo
    canRedo = instance.canRedo

    return () => {
      instance.unmount()
      editor = null
    }
  })

  const chooseTool = (id: Tool): void => {
    // El estado lo devuelve el editor por `onToolChange`, así que aquí no se toca: una sola
    // fuente de verdad.
    editor?.setTool(id)
  }

  const togglePower = (): void => {
    // El estado lo devuelve el editor por `onPoweredChange`, igual que la herramienta: una
    // sola fuente de verdad. Y esto no es solo encender: es el **interruptor de modo**
    // (edición ⇄ ejecución).
    editor?.setPowered(!powered)
  }

  const undo = (): void => {
    editor?.undo()
  }

  const redo = (): void => {
    editor?.redo()
  }

  const clearAll = (): void => {
    editor?.clear()
  }

  const loadExample = (): void => {
    editor?.loadExample()
  }

  const removeSelected = (): void => {
    editor?.removeSelected()
  }
</script>

<div class="diagram">
  <canvas
    bind:this={canvasEl}
    class:placing={!powered && tool !== 'select'}
    class:running={powered}
    class:wiring
  ></canvas>

  <div class="toolbar" role="toolbar" aria-label="Herramientas del circuito">
    {#each TOOLS as item (item.id)}
      <button
        type="button"
        class="tool"
        class:active={tool === item.id}
        title={powered ? 'Con la corriente puesta no se edita: apágala para colocar' : item.title}
        aria-pressed={tool === item.id}
        disabled={powered}
        onclick={() => chooseTool(item.id)}
      >
        {item.glyph}
      </button>
    {/each}

    <span class="divider"></span>

    <button
      type="button"
      class="tool"
      onclick={undo}
      disabled={powered || !canUndo}
      title="Deshacer (Ctrl+Z)"
      aria-label="Deshacer"
    >
      ↶
    </button>
    <button
      type="button"
      class="tool"
      onclick={redo}
      disabled={powered || !canRedo}
      title="Rehacer (Ctrl+Y)"
      aria-label="Rehacer"
    >
      ↷
    </button>

    <span class="divider"></span>

    <button
      type="button"
      onclick={loadExample}
      disabled={powered}
      title="Coloca el circuito de ejemplo (se quita de una vez con Ctrl+Z)"
    >
      Ejemplo
    </button>
    <button
      type="button"
      onclick={removeSelected}
      disabled={powered || !hasSelection}
      title="Borra lo seleccionado y sus cables (Supr)"
    >
      Borrar
    </button>
    <button type="button" onclick={clearAll} disabled={powered} title="Vacía el circuito">
      Vaciar
    </button>

    <span class="divider"></span>

    <button
      type="button"
      class="power"
      class:on={powered}
      onclick={togglePower}
      title="Apagado se edita; encendido solo se prueba · P (en el original, Circuito → Encender)"
      aria-pressed={powered}
    >
      {powered ? '⚡ Encendido' : '⏻ Apagado'}
    </button>
  </div>

  <div class="mode-badge" class:live={powered}>
    {powered
      ? 'Modo ejecución · solo se pulsan interruptores · ⚡ para editar'
      : 'Modo edición · ⚡ para probar el circuito'}
  </div>

  {#if !powered && tool === 'erase'}
    <div class="tool-badge">Borrando · un clic se lleva lo que toques · Esc para salir</div>
  {/if}

  <div class="hud" aria-hidden="true">
    <span>{fps.toFixed(0)} FPS</span>
    <span class="sep">·</span>
    <span>{paintMs.toFixed(2)} ms</span>
    <span class="sep">·</span>
    <span>{zoomPct} %</span>
  </div>
</div>

<style>
  .diagram {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
  }

  canvas.placing {
    cursor: crosshair;
  }

  /* Mientras se tiende un cable, la flecha: el gesto va a conectar, no a mover. Cablear y
     arrastrar empiezan igual —apretar y tirar—, así que el cursor es lo único que los
     distingue. Va después de `.placing` a propósito: si alguien empieza un cable desde un pin
     y a la vez tiene puesta una herramienta de colocar, manda el cable. */
  canvas.wiring {
    cursor: default;
  }

  /* Con la corriente puesta no se edita, así que la cruz de colocar y la mano de mover
     mentirían. Desplazar la vista se sigue pudiendo, pero eso no hay por qué anunciarlo. */
  canvas.running {
    cursor: default;
  }

  /* ── Paleta ─────────────────────────────────────────────────────────── */

  .toolbar {
    position: absolute;
    top: 0.6rem;
    left: 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem;
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    backdrop-filter: blur(6px);
    box-shadow: 0 4px 14px rgb(0 0 0 / 8%);
  }

  .toolbar button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    height: 2rem;
    padding: 0 0.6rem;
    border: 1px solid transparent;
    border-radius: 0.4rem;
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      background-color 100ms ease,
      border-color 100ms ease;
  }

  .toolbar button:hover:not(:disabled) {
    background: var(--panel-bg-hover);
  }

  .toolbar .tool {
    font-size: 1.05rem;
  }

  .toolbar .tool.active {
    border-color: var(--wc-selection);
    background: color-mix(in srgb, var(--wc-selection) 16%, transparent);
  }

  .toolbar button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .toolbar button:focus-visible {
    outline: 2px solid var(--wc-selection);
    outline-offset: 1px;
  }

  .divider {
    width: 1px;
    height: 1.4rem;
    margin: 0 0.2rem;
    background: var(--border);
  }

  .power.on {
    color: var(--wc-state-one);
  }

  /* ── Las etiquetas de estado ────────────────────────────────────────── */

  /* Está siempre puesta, en los dos modos, porque las dos confusiones son simétricas: «¿por
     qué no se enciende nada?» y «¿por qué no puedo mover esto?». El color de «encendido»
     queda para el modo ejecución, que es cuando el circuito está vivo. */
  .mode-badge {
    position: absolute;
    top: 3.7rem;
    left: 0.6rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid color-mix(in srgb, var(--fg) 18%, transparent);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--fg) 6%, var(--panel-bg));
    font-size: 0.75rem;
    color: var(--fg);
    user-select: none;
    pointer-events: none;
  }

  /* Con corriente, el aviso va del color del «encendido»: es el mismo lenguaje que usa el
     LED para decir que el circuito está vivo. */
  .mode-badge.live {
    border-color: color-mix(in srgb, var(--wc-state-one) 45%, transparent);
    background: color-mix(in srgb, var(--wc-state-one) 12%, var(--panel-bg));
  }

  /* Solo aparece con el borrador, que es el único modo que destruye algo con un clic. Va del
     color de aviso —el mismo del «encendido»— porque eso es: un aviso. */
  .tool-badge {
    position: absolute;
    top: 5.7rem;
    left: 0.6rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid color-mix(in srgb, var(--wc-state-one) 45%, transparent);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--wc-state-one) 12%, var(--panel-bg));
    font-size: 0.75rem;
    color: var(--fg);
    user-select: none;
    pointer-events: none;
  }

  /* ── Medidas ────────────────────────────────────────────────────────── */

  .hud {
    position: absolute;
    right: 0.6rem;
    bottom: 0.6rem;
    display: flex;
    gap: 0.35rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--panel-bg) 85%, transparent);
    font: 0.72rem/1.6 var(--font-mono);
    color: var(--fg-muted);
    user-select: none;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }

  .sep {
    opacity: 0.5;
  }
</style>
