<script lang="ts">
  import { onMount } from 'svelte'
  import { Editor, type Tool } from './editor'
  import { deserializeProject, serializeProject } from '../core/persist/json'
  import { importCircuitProject } from '../core/persist/circuitproject'
  import { IdbProvider } from './files/idb-provider'
  import { MAX_GATE_INPUTS, MIN_PIECE_INPUTS, PIECE_GROUPS, PIECES } from './palette'
  import PiecePreview from './PiecePreview.svelte'

  /**
   * La barra de herramientas. Las piezas —compuertas, entradas y salidas— **no** están aquí:
   * viven en la paleta (`palette.ts`), que es la lista completa. Cada botón dice en su `title`
   * la tecla que le toca, que es donde se buscan los atajos; el editor los escucha en su
   * `onKeyDown` y aquí no se repite la tabla.
   */
  const TOOLS: readonly { readonly id: Tool; readonly glyph: string; readonly title: string }[] = [
    { id: 'select', glyph: '⌖', title: 'Seleccionar, mover y cablear (S)' },
    { id: 'erase', glyph: '⌫', title: 'Borrar con un clic lo que se toque (E)' },
  ]

  /** Las piezas agrupadas como las enseña la paleta: el orden lo manda `palette.ts`. */
  const PIECE_SECTIONS = PIECE_GROUPS.map((group) => ({
    ...group,
    pieces: PIECES.filter((piece) => piece.group === group.id),
  }))

  let canvasEl = $state<HTMLCanvasElement | null>(null)
  let tool = $state<Tool>('select')
  /** Los dos modos los gobierna la corriente. Arranca apagada, como el original. */
  let powered = $state(false)
  let hasSelection = $state(false)
  let isEmpty = $state(true)
  let dirty = $state(false)
  let recovered = $state(false)
  let openError = $state<string | null>(null)
  let hoverInfo = $state<{ x: number; y: number; value: number; bitWidth: number } | null>(null)
  let canUndo = $state(false)
  let canRedo = $state(false)
  /** Se está tendiendo un cable: el cursor deja de ser la mano y pasa a ser la flecha. */
  let wiring = $state(false)
  /** El circuito no se pudo simular. Se enseña y se quita al volver a dar corriente. */
  let error = $state<string | null>(null)
  /** Ruta de circuitos (jerarquía). El primero es siempre el principal. */
  let circuitPath = $state<readonly string[]>(['main'])
  /** Cuántas entradas tendrá la próxima compuerta que se coloque desde la paleta. */
  let placeInputs = $state(2)

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
        // El aviso se limpia al cambiar de modo: el error se refiere a lo que había encendido,
        // y al apagar deja de tener sentido. Se limpia aquí —y no en el botón— porque la
        // corriente también se conmuta con `P`, desde dentro del editor.
        error = null
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
        if (editor !== null) {
          isEmpty = editor.elementCount === 0
          dirty = editor.dirty
        }
      },
      onWiringChange: (value) => {
        wiring = value
      },
      onHoverChange: (wireId, value, bitWidth, clientX, clientY) => {
        if (wireId === null || value === null || canvasEl === null) {
          hoverInfo = null
          return
        }
        const rect = canvasEl.getBoundingClientRect()
        hoverInfo = { x: clientX - rect.left, y: clientY - rect.top, value, bitWidth }
      },
      // El circuito no se puede simular. Se enseña en vez de callarse: simular mal es peor que
      // no simular, y el original también avisa.
      onError: (message) => {
        error = message
      },
      onCircuitChange: (path) => {
        circuitPath = path
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
    placeInputs = instance.placeInputs
    isEmpty = instance.elementCount === 0
    circuitPath = instance.circuitPath
    dirty = instance.dirty

    const idb = new IdbProvider()

    // Recuperación de sesión (M4-19): si hay autosave y el lienzo está vacío, cargarlo.
    if (instance.elementCount === 0) {
      idb.open().then((saved) => {
        if (saved && editor === instance) {
          try {
            const project = deserializeProject(saved.content)
            instance.loadProject(project)
            instance.markSaved()
            dirty = instance.dirty
            recovered = true
          } catch {
            // ignore
          }
        }
      })
    }

    // Autoguardado periódico (M4-17): cada 30 s si hay cambios.
    const autosaveTimer = setInterval(() => {
      if (editor !== instance) return
      if (!instance.dirty) return
      const payload = serializeProject(instance.project)
      idb.save(payload, 'autosave').catch(() => {})
    }, 30000)

    // Guardar al ocultar la pestaña.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && editor === instance && instance.dirty) {
        const payload = serializeProject(instance.project)
        idb.save(payload, 'autosave').catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(autosaveTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      instance.unmount()
      editor = null
    }
  })

  const handleDrop = async (e: DragEvent): Promise<void> => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (!file || editor === null) return
    const text = await file.text()
    try {
      let project
      if (file.name.endsWith('.CircuitProject') || text.trim().startsWith('<')) {
        project = importCircuitProject(text)
      } else {
        project = deserializeProject(text)
      }
      editor.loadProject(project)
      editor.markSaved()
      dirty = editor.dirty
    } catch (err) {
      openError = err instanceof Error ? err.message : 'Fichero no válido'
      setTimeout(() => (openError = null), 4000)
    }
  }

  const chooseTool = (id: Tool): void => {
    // El estado lo devuelve el editor por `onToolChange`, así que aquí no se toca: una sola
    // fuente de verdad.
    editor?.setTool(id)
  }

  /**
   * El número de entradas de la próxima compuerta.
   *
   * El editor recorta al tope del modelo y **devuelve** lo que ha aceptado: si se escribe un
   * 99, se coloca una compuerta de 18 y el campo tiene que enseñar ese 18, no el 99.
   */
  const changeInputs = (event: Event): void => {
    const field = event.currentTarget as HTMLInputElement | null
    if (field === null || editor === null) {
      return
    }
    placeInputs = editor.setPlaceInputs(field.valueAsNumber)
    field.value = String(placeInputs)
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

  const newSubcircuit = (): void => {
    if (editor === null) return
    const id = editor.createSubcircuit()
    editor.enterSubcircuit(id)
  }

  const goUp = (): void => {
    editor?.exitSubcircuit()
  }
</script>

<div
  class="diagram"
  role="application"
  aria-label="Lienzo del circuito"
  ondragover={(e) => { e.preventDefault() }}
  ondrop={handleDrop}
>
  <canvas
    bind:this={canvasEl}
    class:placing={!powered && tool !== 'select'}
    class:running={powered}
    class:wiring
    aria-label="Lienzo del circuito"
    onpointerleave={() => (hoverInfo = null)}
  ></canvas>

  {#if hoverInfo}
    <div class="probe" style="left:{hoverInfo.x + 12}px; top:{hoverInfo.y + 12}px;">
      {hoverInfo.bitWidth > 1 ? `0x${hoverInfo.value.toString(16).toUpperCase()}` : hoverInfo.value}
      {#if hoverInfo.bitWidth > 1}<span class="probe-sub">({hoverInfo.value})</span>{/if}
    </div>
  {/if}

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
      onclick={() => editor?.fitToContent()}
      title="Encuadrar todo el circuito"
      aria-label="Encuadrar"
    >
      ⊞
    </button>

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

  <aside class="palette" class:disabled={powered} aria-label="Piezas para colocar">
    <div class="palette-head">
      <span class="palette-title">Piezas</span>
      <label class="inputs" title="Cuántas entradas tendrá la próxima compuerta que coloques">
        <span>entradas</span>
        <input
          type="number"
          min={MIN_PIECE_INPUTS}
          max={MAX_GATE_INPUTS}
          value={placeInputs}
          disabled={powered}
          onchange={changeInputs}
        />
      </label>
    </div>

    {#each PIECE_SECTIONS as section (section.id)}
      <div class="palette-group">
        <span class="group-title">{section.title}</span>
        <div class="pieces">
          {#each section.pieces as piece (piece.id)}
            <button
              type="button"
              class="piece"
              class:active={tool === piece.id}
              title={powered
                ? 'Con la corriente puesta no se edita: apágala para colocar'
                : piece.title}
              aria-pressed={tool === piece.id}
              disabled={powered}
              onclick={() => chooseTool(piece.id)}
            >
              <PiecePreview piece={piece} inputs={placeInputs} />
              <span>{piece.label}</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </aside>

  <div class="breadcrumb" aria-label="Ruta de circuitos">
    {#each circuitPath as id, i (id)}
      <span class="crumb">{id === 'main' ? 'Principal' : id}</span>
      {#if i < circuitPath.length - 1}<span class="sep">›</span>{/if}
    {/each}
    <button type="button" class="crumb-btn" onclick={newSubcircuit} disabled={powered} title="Crear y entrar en un subcircuito">+ Subcircuito</button>
    {#if circuitPath.length > 1}
      <button type="button" class="crumb-btn" onclick={goUp} disabled={powered} title="Subir un nivel">↑ Subir</button>
    {/if}
  </div>

  {#if isEmpty && !powered}
    <div class="empty-state" aria-live="polite">
      <p>Lienzo vacío</p>
      <p class="hint">Elige una pieza de la paleta y haz clic, o pulsa <kbd>Ejemplo</kbd>.</p>
    </div>
  {/if}

  <div class="mode-badge" class:live={powered} aria-live="polite">
    {powered
      ? 'Modo ejecución · solo se pulsan interruptores · ⚡ para editar'
      : 'Modo edición · ⚡ para probar el circuito'}
  </div>

  {#if error !== null}
    <div class="error-badge" role="alert">
      <strong>El circuito no se puede simular.</strong>
      {error}
    </div>
  {/if}
  {#if recovered}
    <div class="info-badge" role="status">
      Sesión recuperada del autoguardado.
      <button type="button" onclick={() => (recovered = false)}>×</button>
    </div>
  {/if}
  {#if openError !== null}
    <div class="error-badge" role="alert">{openError}</div>
  {/if}

  {#if !powered && tool === 'erase'}
    <div class="tool-badge">Borrando · un clic se lleva lo que toques · Esc para salir</div>
  {/if}

  <div class="hud" aria-hidden="true">
    {#if dirty}<span class="dirty">● sin guardar</span><span class="sep">·</span>{/if}
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

  /* ── Barra de herramientas ──────────────────────────────────────────── */

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

  /* ── Paleta de piezas ───────────────────────────────────────────────── */

  /* A la derecha y no a la izquierda porque ahí ya están la barra, el aviso de modo y el del
     borrador: el circuito queda en medio. Se desplaza por dentro si no cabe entera, que es
     mejor que recortarla. */
  .palette {
    position: absolute;
    top: 3.4rem;
    left: 0.6rem;
    width: 12.5rem;
    max-height: calc(100% - 3.4rem);
    overflow-y: auto;
    padding: 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    backdrop-filter: blur(6px);
    box-shadow: 0 4px 14px rgb(0 0 0 / 8%);
    color: var(--fg);
    font-size: 0.78rem;
    user-select: none;
  }

  .palette-head {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.15rem 0.35rem;
  }

  .palette-title {
    color: var(--fg-muted);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .inputs {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    color: var(--fg-muted);
    font-size: 0.68rem;
  }

  .inputs input {
    width: 2.8rem;
    padding: 0.1rem 0.2rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--panel-bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.72rem;
  }

  .palette-group + .palette-group {
    margin-top: 0.4rem;
  }

  .group-title {
    display: block;
    padding: 0 0.15rem 0.2rem;
    color: var(--fg-muted);
    font-size: 0.66rem;
  }

  .pieces {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.2rem;
  }

  .piece {
    padding: 0.25rem 0.3rem;
    border: 1px solid transparent;
    border-radius: 0.35rem;
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-size: 0.74rem;
    text-align: center;
    cursor: pointer;
    transition:
      background-color 100ms ease,
      border-color 100ms ease;
  }

  .piece:hover:not(:disabled) {
    background: var(--panel-bg-hover);
  }

  /* La pieza que se va a colocar se marca igual que la herramienta activa de la barra: es la
     misma pregunta («¿qué hace el clic?») y merece la misma respuesta visual. */
  .piece.active {
    border-color: var(--wc-selection);
    background: color-mix(in srgb, var(--wc-selection) 16%, transparent);
  }

  /* Con la corriente puesta no se edita, así que la paleta se apaga entera: dejar pulsar una
     pieza que no va a colocar nada sería mentir. */
  .palette.disabled .piece,
  .palette.disabled .inputs {
    opacity: 0.45;
  }

  .piece:disabled {
    cursor: default;
  }

  /* ── Avisos ─────────────────────────────────────────────────────────── */

  /* Está siempre puesta, en los dos modos, porque las dos confusiones son simétricas: «¿por
     qué no se enciende nada?» y «¿por qué no puedo mover esto?». El color de «encendido»
     queda para el modo ejecución, que es cuando el circuito está vivo. */
  .mode-badge {
    position: absolute;
    top: 3.7rem;
    right: 0.6rem;
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
    right: 0.6rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid color-mix(in srgb, var(--wc-state-one) 45%, transparent);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--wc-state-one) 12%, var(--panel-bg));
    font-size: 0.75rem;
    color: var(--fg);
    user-select: none;
    pointer-events: none;
  }

  /* El aviso de que el circuito no se puede simular. Va en rojo de alarma —y no con un color
     del tema— porque un error tiene que gritar igual en los dos temas: no es parte de la
     paleta, es un aviso. Ocupa el sitio del aviso del borrador, que solo sale apagado: un
     circuito que no se simula solo puede ser con la corriente puesta. */
  .error-badge {
    position: absolute;
    top: 5.7rem;
    right: 0.6rem;
    max-width: min(30rem, calc(100% - 1.2rem));
    padding: 0.35rem 0.6rem;
    border: 1px solid color-mix(in srgb, var(--wc-error) 60%, transparent);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--wc-error) 14%, var(--panel-bg));
    font-size: 0.75rem;
    color: var(--fg);
    user-select: none;
    pointer-events: none;
  }

  /* ── Breadcrumb de jerarquía (M3-02) ───────────────────────────────── */
  .breadcrumb {
    position: absolute;
    top: 0.6rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    backdrop-filter: blur(6px);
    font-size: 0.75rem;
    color: var(--fg);
    user-select: none;
    z-index: 2;
  }

  .breadcrumb .crumb {
    color: var(--fg-muted);
  }

  .breadcrumb .sep {
    opacity: 0.5;
  }

  .breadcrumb .crumb-btn {
    padding: 0.15rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.35rem;
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .breadcrumb .crumb-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* ── Estado vacío ───────────────────────────────────────────────────── */
  .empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    pointer-events: none;
    color: var(--fg-muted);
    text-align: center;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.9rem;
  }

  .empty-state .hint {
    font-size: 0.78rem;
  }

  .empty-state kbd {
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--panel-bg);
    font: inherit;
    font-size: 0.78rem;
  }

  /* ── Medidas ────────────────────────────────────────────────────────── */

  .hud {
    position: absolute;
    left: 0.6rem;
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

  .probe {
    position: absolute;
    pointer-events: none;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    font: 0.72rem/1.4 var(--font-mono);
    color: var(--fg);
    white-space: nowrap;
    z-index: 5;
  }
  .probe-sub {
    color: var(--fg-muted);
    margin-left: 0.35rem;
  }

  .sep {
    opacity: 0.5;
  }
</style>
