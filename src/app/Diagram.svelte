<script lang="ts">
  import { onMount } from 'svelte'
  import { Editor, type Tool } from './editor'
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte'
  import Inspector from './Inspector.svelte'
  import Minimap from './Minimap.svelte'
  import LayersPanel from './LayersPanel.svelte'
  import SettingsPanel from './SettingsPanel.svelte'
  import ThemeEditor from './ThemeEditor.svelte'
  import CommandPalette from './CommandPalette.svelte'
import Modal from './Modal.svelte'
import ExamplePicker from './ExamplePicker.svelte'
import TruthTablePanel from './components/truthtable/TruthTablePanel.svelte'
import TestSocketPanel from './components/test-socket/TestSocketPanel.svelte'
import TextPrompt from './components/TextPrompt.svelte'
import Icon from './Icon.svelte'
import type { CircuitAnnotation, CircuitMarker } from '../core/model/overlay'
  import { deserializeProject, serializeProject } from '../core/persist/json'
  import { exportCircuitProject, importCircuitProject } from '../core/persist/circuitproject'
  import { loadSettings, SETTINGS_EVENT } from './settings'
  import { IdbProvider } from './files/idb-provider'
  import { createFileProvider } from './files/provider-factory'
  import { addRecent } from './files/recents'
  import { saveVersion } from './files/versions'
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
    { id: 'wire', glyph: '∿', title: 'Modo cableado: solo cablear y colorear (W)' },
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
  /** Piezas del circuito que el lienzo todavía no sabe dibujar (pines, repartidores…). */
  let unsupported = $state(0)
  /** Diagnóstico de capas: sin esto, ocultar o bloquear una capa parece «la app no responde». */
  let hiddenLayers = $state(0)
  let visibleCount = $state(0)
  let activeLayerLocked = $state(false)
  let activeLayerName = $state('')
  let openError = $state<string | null>(null)
  let hoverInfo = $state<{ x: number; y: number; value: number; bitWidth: number } | null>(null)
  let contextMenu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null)
  let showSettings = $state(false)
  let showTruthTable = $state(false)
  let showTestSockets = $state(false)
  let showThemeEditor = $state(false)
  let showCommandPalette = $state(false)
  let showConfirmClear = $state(false)
  let showConfirmExample = $state(false)
  let showExamplePicker = $state(false)
  let pendingExampleId = $state<string | null>(null)
  let showLayers = $state(false)
  let canUndo = $state(false)
  let canRedo = $state(false)
  /** Se está tendiendo un cable: el cursor deja de ser la mano y pasa a ser la flecha. */
  let wiring = $state(false)
  /** El circuito no se pudo simular. Se enseña y se quita al volver a dar corriente. */
  let error = $state<string | null>(null)
  /** Ruta de circuitos (jerarquía). El primero es siempre el principal. */
  let circuitPath = $state<readonly string[]>(['main'])
  /** La misma ruta, con nombres, para el breadcrumb. */
  let breadcrumb = $state<readonly { readonly id: string; readonly name: string }[]>([
    { id: 'main', name: 'Main' },
  ])
  /** Todos los circuitos del proyecto, para ofrecerlos en la paleta. */
  let circuits = $state<readonly { readonly id: string; readonly name: string }[]>([])
  /** El circuito que se está editando: no se ofrece a sí mismo como subcircuito. */
  let currentCircuitId = $state('main')
  /** Subcircuito elegido para colocar. */
  let placeCircuitId = $state<string | null>(null)

  /** Los subcircuitos que se pueden colocar ahora mismo. */
  let otherCircuits = $derived(circuits.filter((circuit) => circuit.id !== currentCircuitId))
  /** Cuántas entradas tendrá la próxima compuerta que se coloque desde la paleta. */
  let placeInputs = $state(2)

  let fps = $state(0)
  let paintMs = $state(0)
  let viewVersion = $state(0)

  let annotations = $state<CircuitAnnotation[]>([])
  let markers = $state<CircuitMarker[]>([])
  let annotateMode = $state(false)
  let markerMode = $state(false)
  let overlayPrompt = $state<{ kind: 'note' | 'marker'; world: { x: number; y: number } } | null>(null)
  let zoomPct = $state(100)

  /**
   * El editor se crea en `onMount`, así que antes de eso no existe. No es `$state` a
   * propósito: no hay nada que redibujar cuando cambia, solo hay que poder llamarlo.
   */
  let editor = $state<Editor | null>(null)

  /**
   * Vuelca la jerarquía del editor a la interfaz.
   *
   * La paleta necesita saber qué circuitos existen y cuál es el actual; el breadcrumb,
   * cómo se llaman. Se hace en un solo sitio para que no se queden desincronizados al
   * crear, entrar o salir de un subcircuito.
   */
  const syncHierarchy = (instance: Editor): void => {
    circuitPath = instance.circuitPath
    breadcrumb = instance.circuitBreadcrumb
    currentCircuitId = instance.currentCircuitId
    circuits = instance.project.circuitsList.map((circuit) => ({
      id: circuit.id,
      name: circuit.name,
    }))
    unsupported = instance.diagram.storedElements.length - instance.diagram.elements.length
  }

  /** Vuelca notas y marcadores del circuito actual a los overlays de la interfaz. */
  const syncOverlays = (instance: Editor): void => {
    annotations = instance.diagram.annotations
    markers = instance.diagram.markers
  }

  onMount(() => {
    const canvas = canvasEl
    if (canvas === null) {
      return
    }

    /** El autoguardado espera a que el usuario deje de mover cosas (ver `scheduleAutosave`). */
    let autosaveTimer: ReturnType<typeof setTimeout> | null = null

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
      },
      // Cada cambio del documento —no solo los que mueven el historial— actualiza el punto
      // de «sin guardar» y programa el autoguardado. Antes solo se enteraba al aparecer la
      // posibilidad de deshacer, así que después de guardar el aviso se quedaba apagado.
      onDocumentChange: () => {
        dirty = instance.dirty
        isEmpty = instance.elementCount === 0
        unsupported = instance.diagram.storedElements.length - instance.diagram.elements.length
        syncLayers()
        syncOverlays(instance)
        scheduleAutosave()
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
      onCircuitChange: () => {
        placeCircuitId = null
        isEmpty = instance.elementCount === 0
        dirty = instance.dirty
        syncHierarchy(instance)
        syncLayers()
        syncOverlays(instance)
      },
    })
    editor = instance
    const unsubView = instance.subscribeView(() => { viewVersion++ })

    /**
     * Lo que la paleta tapa por la izquierda.
     *
     * La cámara tiene que dejar el origen a su derecha: con el margen antiguo, el circuito de
     * ejemplo —y cualquier proyecto guardado con coordenadas pequeñas— aparecía **debajo** de
     * la paleta, y el lienzo parecía blanco.
     */
    const railInset = (): number => {
      const rail = document.querySelector<HTMLElement>('.left-rail')
      if (rail === null) return 0
      return Math.max(0, rail.getBoundingClientRect().right - canvas.getBoundingClientRect().left + 12)
    }

    instance.mount(canvas, { insets: { left: railInset() } })

    // Al cambiar el ancho (ventana estrecha) la paleta se hace más pequeña; el hueco se
    // recalcula para que «Encuadrar» siga encuadrando en lo que se ve.
    const syncInsets = (): void => instance.setViewportInsets({ left: railInset() })
    window.addEventListener('resize', syncInsets)
    const insetsObserver = new ResizeObserver(syncInsets)
    insetsObserver.observe(canvas)
    const rail = document.querySelector<HTMLElement>('.left-rail')
    if (rail !== null) insetsObserver.observe(rail)

    // El editor manda: él sabe con qué corriente, con qué herramienta y con cuánto historial
    // arranca de verdad, así que el estado inicial se lee de ahí y no se duplica aquí.
    powered = instance.isPowered
    tool = instance.currentTool
    canUndo = instance.canUndo
    canRedo = instance.canRedo
    placeInputs = instance.placeInputs
    isEmpty = instance.elementCount === 0
    dirty = instance.dirty
    syncHierarchy(instance)
    syncLayers()
    syncOverlays(instance)

    // Preferencias del usuario (M4-10): rejilla, imán y autoguardado. Sin esto, el panel de
    // Preferencias guardaba los valores y no pasaba nada.
    const applySettings = (): void => {
      const settings = loadSettings()
      instance.setShowGrid(settings.gridVisible)
      instance.setSnapToGrid(settings.snapToGrid)
    }
    applySettings()
    window.addEventListener(SETTINGS_EVENT, applySettings)

    const idb = new IdbProvider()

    // Compartir por link (M4-22): si la URL tiene un proyecto en el hash, cargarlo.
    if (window.location.hash.startsWith('#p=')) {
      try {
        const encoded = window.location.hash.slice(3)
        const json = decodeURIComponent(atob(encoded))
        const project = deserializeProject(json)
        instance.loadProject(project)
        instance.markSaved()
        instance.fitToContent()
        dirty = instance.dirty
        unsupported = instance.diagram.storedElements.length - instance.diagram.elements.length
        syncLayers()
      } catch {
        // ignore
      }
    }

    // Recuperación de sesión (M4-19): si hay autosave y el lienzo está vacío, cargarlo.
    if (instance.elementCount === 0) {
      void idb.open().then((saved) => {
        // Si el usuario ya ha empezado a trabajar mientras IndexedDB abría, no se le pisa.
        if (saved && editor === instance && instance.elementCount === 0 && !instance.dirty) {
          try {
            const project = deserializeProject(saved.content)
            instance.loadProject(project)
            instance.markSaved()
            dirty = instance.dirty
            isEmpty = instance.elementCount === 0
            unsupported = instance.diagram.storedElements.length - instance.diagram.elements.length
            syncLayers()
            // Un autoguardado vacío no es una sesión que anunciar: se carga (es el estado
            // guardado), pero no se enseña «Sesión recuperada» sobre un lienzo en blanco.
            if (instance.elementCount > 0) {
              instance.fitToContent()
              recovered = true
            }
          } catch {
            // ignore
          }
        }
      })
    }

    /**
     * Escribe el autoguardado, si hay algo que guardar y el usuario lo tiene activado.
     *
     * Se separa del temporizador porque también lo llaman los gestos de salida (`pagehide`,
     * pestaña oculta) y el autoguardado diferido.
     */
    const writeAutosave = (): void => {
      if (editor !== instance) return
      if (!instance.dirty) return
      if (!loadSettings().autosaveEnabled) return
      const payload = serializeProject(instance.project)
      idb.save(payload, 'autosave').catch(() => {})
    }

    /**
     * Autoguardado diferido (M4-17): 800 ms después del último cambio.
     *
     * Antes solo se guardaba cada 30 s, así que recargar enseguida —lo normal cuando se está
     * probando— recuperaba una versión vieja o vacía. El temporizador de 30 s se queda como
     * red de seguridad para cambios que no pasen por aquí.
     */
    function scheduleAutosave(): void {
      if (autosaveTimer !== null) {
        clearTimeout(autosaveTimer)
      }
      autosaveTimer = setTimeout(() => {
        autosaveTimer = null
        writeAutosave()
      }, 800)
    }

    const autosaveInterval = setInterval(writeAutosave, 30000)

    // Guardar al ocultar la pestaña o al recargar/cerrar. `pagehide` es el que se dispara de
    // verdad en una recarga; `visibilitychange` no siempre llega a tiempo.
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        showCommandPalette = !showCommandPalette
      } else if (key === 's') {
        e.preventDefault()
        void saveFile()
      } else if (key === 'o') {
        e.preventDefault()
        void openFile()
      }
    }
    window.addEventListener('keydown', onKey)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        writeAutosave()
      }
    }
    const onPageHide = () => writeAutosave()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      if (autosaveTimer !== null) {
        clearTimeout(autosaveTimer)
      }
      clearInterval(autosaveInterval)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(SETTINGS_EVENT, applySettings)
      window.removeEventListener('resize', syncInsets)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      insetsObserver.disconnect()
      unsubView()
      instance.unmount()
      editor = null
    }
  })

  /**
   * La puerta a los ficheros del sistema (M4-12..15).
   *
   * Se elige una vez el proveedor: File System Access si el navegador lo tiene (Chrome/Edge),
   * y si no, descarga/subida por `<input type="file">` y `<a download>`, que funciona en todos.
   */
  const files = createFileProvider()

  /**
   * Refresca el diagnóstico de capas.
   *
   * Sirve para explicar lo que antes era un silencio: con una capa oculta el lienzo puede
   * parecer vacío, y con una capa bloqueada se puede colocar pero no mover, cablear ni
   * pulsar interruptores. Ninguna de las dos cosas se veía en la interfaz.
   */
  function syncLayers(): void {
    if (editor === null) return
    const diagram = editor.diagram
    hiddenLayers = diagram.layersList.filter((layer) => !layer.visible).length
    visibleCount = diagram.visibleElements.length
    activeLayerLocked = diagram.isLayerLocked(diagram.activeLayerId)
    activeLayerName = diagram.layersList.find((layer) => layer.id === diagram.activeLayerId)?.name ?? ''
  }

  /** Vuelve a mostrar todas las capas (sale de un «aislar» o de una ocultación). */
  const showAllLayers = (): void => {
    editor?.diagram.showAllLayers()
  }

  /** Desbloquea la capa activa: la edición vuelve a responder. */
  const unlockActiveLayer = (): void => {
    if (editor !== null) {
      editor.diagram.setLayerLocked(editor.diagram.activeLayerId, false)
    }
  }

  /**
   * Carga en el editor el texto de un fichero, sea JSON nuestro o `.CircuitProject` del
   * original. Se decide por el nombre y, si no está claro, por el contenido.
   */
  const openText = (name: string, text: string): void => {
    if (editor === null) return
    try {
      const project =
        name.endsWith('.CircuitProject') || name.endsWith('.xml') || text.trimStart().startsWith('<')
          ? importCircuitProject(text)
          : deserializeProject(text)
      editor.loadProject(project)
      editor.markSaved()
      editor.fitToContent()
      dirty = editor.dirty
      isEmpty = editor.elementCount === 0
      unsupported = editor.diagram.storedElements.length - editor.diagram.elements.length
      syncLayers()
      addRecent(name)
    } catch (err) {
      openError = err instanceof Error ? err.message : 'Fichero no válido'
      setTimeout(() => (openError = null), 4000)
    }
  }

  const handleDrop = async (e: DragEvent): Promise<void> => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    openText(file.name, await file.text())
  }

  /** Abre el diálogo del sistema y carga lo que se elija. */
  const openFile = async (): Promise<void> => {
    if (editor === null) return
    const picked = await files.open()
    if (picked !== null) {
      openText(picked.name, picked.content)
    }
  }

  /** Guarda el proyecto como JSON. Marca el documento como guardado. */
  const saveFile = async (): Promise<void> => {
    if (editor === null) return
    const handle = await files.save(serializeProject(editor.project), `${editor.project.name || 'circuito'}.json`)
    // Si el usuario canceló el diálogo, no se ha guardado nada: no se marca como guardado.
    if (handle === null) return
    editor.markSaved()
    dirty = editor.dirty
  }

  /** Exporta el proyecto al `.CircuitProject` (XML) del original. */
  const exportXml = async (): Promise<void> => {
    if (editor === null) return
    await files.save(exportCircuitProject(editor.project), `${editor.project.name || 'circuito'}.CircuitProject`)
  }

  const chooseTool = (id: Tool): void => {
    // El estado lo devuelve el editor por `onToolChange`, así que aquí no se toca: una sola
    // fuente de verdad.
    editor?.setTool(id)
  }

  /** Elige un subcircuito de la paleta para colocarlo. */
  const chooseSubcircuit = (id: string): void => {
    placeCircuitId = id
    editor?.setPlaceCircuit(id)
  }

  /**
   * Abre el subcircuito que hay bajo el doble clic.
   *
   * Es el gesto natural para «entrar» en una pieza jerárquica y evita tener que buscar el
   * botón del breadcrumb: la instancia es la puerta.
   */
  const openSubcircuitAt = (event: MouseEvent): void => {
    if (editor === null || powered) return
    const hit = editor.hitAt(event.clientX, event.clientY)
    if (hit?.kind === 'device' && hit.element.kind === 'circuit') {
      if (editor.enterSubcircuit(hit.element.targetCircuitId)) {
        editor.fitToContent()
      }
    }
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
    if (editor && editor.elementCount > 0) {
      showConfirmClear = true
      return
    }
    editor?.clear()
    editor?.resetView()
  }

  const confirmClearAll = (): void => {
    showConfirmClear = false
    editor?.clear()
    editor?.resetView()
  }

  const loadExample = (): void => {
    if (editor === null) return
    showExamplePicker = true
  }

  const pickExample = (id: string): void => {
    showExamplePicker = false
    if (editor !== null && editor.elementCount > 0) {
      pendingExampleId = id
      showConfirmExample = true
      return
    }
    editor?.loadExample(id)
    editor?.fitToContent()
  }

  const confirmLoadExample = (): void => {
    showConfirmExample = false
    if (pendingExampleId !== null) {
      editor?.loadExample(pendingExampleId)
      editor?.fitToContent()
      pendingExampleId = null
    }
  }



  const removeSelected = (): void => {
    editor?.removeSelected()
  }

  const newSubcircuit = (): void => {
    if (editor === null) return
    const id = editor.createSubcircuit()
    if (editor.enterSubcircuit(id)) {
      // Un subcircuito nace vacío: se deja la vista en el origen para que el primer pin
      // aparezca donde se está mirando y no en mitad de la nada.
      editor.resetView()
    }
  }

  const goUp = (): void => {
    if (editor?.exitSubcircuit() === true) {
      editor.fitToContent()
    }
  }

  const saveVersionNow = (): void => {
    if (editor === null) return
    try {
      saveVersion(`v${new Date().toLocaleString()}`, serializeProject(editor.project))
      openError = 'Versión guardada'
      setTimeout(() => (openError = null), 2000)
    } catch {
      openError = 'No se pudo guardar la versión'
      setTimeout(() => (openError = null), 2000)
    }
  }

  const shareLink = (): void => {
    if (editor === null) return
    try {
      const json = serializeProject(editor.project)
      const encoded = btoa(encodeURIComponent(json))
      const url = `${window.location.origin}${window.location.pathname}#p=${encoded}`
      navigator.clipboard?.writeText(url)
      // feedback simple
      openError = 'Enlace copiado al portapapeles'
      setTimeout(() => (openError = null), 2500)
    } catch {
      openError = 'No se pudo generar el enlace'
      setTimeout(() => (openError = null), 2500)
    }
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
    ondblclick={openSubcircuitAt}
    oncontextmenu={(e) => {
      e.preventDefault()
      if (editor === null) return
      const hit = editor.hitAt(e.clientX, e.clientY)
      const items: MenuItem[] = []
      if (hit?.kind === 'device') {
        if (hit.element.kind === 'circuit') {
          const target = hit.element.targetCircuitId
          items.push({
            label: 'Abrir subcircuito',
            action: () => {
              if (editor?.enterSubcircuit(target) === true) {
                editor.fitToContent()
              }
            },
          })
        }
        items.push({ label: 'Rotar 90°', shortcut: 'R', action: () => { editor?.select(hit.element.id); editor?.rotateSelection(true) } })
        items.push({ label: 'Duplicar', shortcut: 'Ctrl+D', action: () => { editor?.select(hit.element.id); editor?.duplicate() } })
        items.push({ label: 'Borrar', shortcut: 'Del', danger: true, action: () => { editor?.select(hit.element.id); editor?.removeSelected() } })
      } else if (hit?.kind === 'wire') {
        items.push({ label: 'Borrar cable', shortcut: 'Del', danger: true, action: () => { editor?.select(hit.element.id); editor?.removeSelected() } })
      } else {
        items.push({ label: 'Pegar', shortcut: 'Ctrl+V', action: () => editor?.paste() })
        items.push({ label: 'Encuadrar', action: () => editor?.fitToContent() })
        items.push({ label: 'Vaciar lienzo', danger: true, action: () => clearAll() })
      }
      contextMenu = { x: e.clientX, y: e.clientY, items }
    }}
  ></canvas>

  {#if annotateMode || markerMode}
    <div
      class="overlay-capture"
      role="button"
      tabindex="-1"
      aria-hidden="true"
      onpointerdown={(e) => {
        if (editor === null) return
        e.preventDefault()
        const world = editor.worldAtClient(e.clientX, e.clientY)
        overlayPrompt = { kind: annotateMode ? 'note' : 'marker', world }
        annotateMode = false
        markerMode = false
      }}
    ></div>
  {/if}

  {#key viewVersion}
    {#each annotations as note (note.id)}
      {@const pos = editor?.toScreen(note.position) ?? { x: 0, y: 0 }}
      <div class="annotation" style="left:{pos.x}px; top:{pos.y}px;">{note.text}</div>
    {/each}

    {#each markers as mark (mark.id)}
      {@const pos = editor?.toScreen(mark.position) ?? { x: 0, y: 0 }}
      <div class="marker" style="left:{pos.x}px; top:{pos.y}px;" title={mark.label}>●</div>
    {/each}
  {/key}

  {#if overlayPrompt}
    <TextPrompt
      title={overlayPrompt.kind === 'note' ? 'Nueva nota' : 'Nuevo marcador'}
      label={overlayPrompt.kind === 'note' ? 'Texto de la nota' : 'Texto del marcador'}
      placeholder={overlayPrompt.kind === 'note' ? 'Explica qué hace esta parte' : 'Nombre del punto'}
      confirmLabel="Añadir"
      onCancel={() => (overlayPrompt = null)}
      onConfirm={(text) => {
        const prompt = overlayPrompt
        const value = text.trim()
        if (value !== '' && editor !== null && prompt !== null) {
          if (prompt.kind === 'note') editor.diagram.addAnnotation(prompt.world, value)
          else editor.diagram.addMarker(prompt.world, value)
          syncOverlays(editor)
        }
        overlayPrompt = null
      }}
    />
  {/if}
  {#if hoverInfo}
    <div class="probe" style="left:{hoverInfo.x + 12}px; top:{hoverInfo.y + 12}px;">
      {hoverInfo.bitWidth > 1 ? `0x${hoverInfo.value.toString(16).toUpperCase()}` : hoverInfo.value}
      {#if hoverInfo.bitWidth > 1}<span class="probe-sub">({hoverInfo.value})</span>{/if}
    </div>
  {/if}

  <div class="toolbar" role="toolbar" aria-label="Herramientas del circuito">
    <button type="button" class="tool" onclick={openFile} title="Abrir un circuito (Ctrl+O)" aria-label="Abrir"><Icon name="open" /></button>
    <button type="button" class="tool" onclick={saveFile} title="Guardar el circuito (Ctrl+S)" aria-label="Guardar" disabled={!dirty}><Icon name="save" /></button>
    <button type="button" class="tool" onclick={exportXml} title="Exportar al formato del original (.CircuitProject)" aria-label="Exportar XML"><Icon name="export" /></button>

    <span class="divider"></span>

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
      <Icon name="fit" />
    </button>
    <button
      type="button"
      class="tool"
      onclick={shareLink}
      title="Copiar enlace para compartir el circuito"
      aria-label="Compartir"
    >
      <Icon name="share" />
    </button>
    <button
      type="button"
      class="tool"
      onclick={saveVersionNow}
      title="Guardar una versión local"
      aria-label="Guardar versión"
    >
      <Icon name="version" />
    </button>
    <button
      type="button"
      class="tool"
      onclick={() => (showTruthTable = true)}
      title="Tabla de verdad (M8)"
      aria-label="Tabla de verdad"
    >
      <Icon name="table" />
    </button>
    <button
      type="button"
      class="tool"
      onclick={() => (showSettings = true)}
      title="Preferencias"
      aria-label="Preferencias"
    >
      <Icon name="settings" />
    </button>
    <button
      type="button"
      class="tool"
      onclick={() => (showLayers = !showLayers)}
      title="Capas"
      aria-label="Capas"
    >
      <Icon name="layers" />
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
      {powered ? 'Encendido' : 'Apagado'}
    </button>
  </div>

  {#if tool === 'wire' && !powered}
    <div class="wire-colors" role="toolbar" aria-label="Colores de cable">
      {#each loadSettings().savedWireColors as color (color)}
        <button type="button" class="swatch" style="background:{color}" title="Aplicar color {color}" aria-label="Aplicar color {color}" onclick={() => editor?.colorSelection(color)}></button>
      {/each}
      <button type="button" class="clear-color" title="Quitar color forzado" onclick={() => editor?.colorSelection('')}>x</button>
    </div>
  {/if}

  <!-- La paleta y el breadcrumb viven en la misma columna: así no pueden solaparse. Antes eran
       dos cajas absolutas con el mismo `left` y el breadcrumb se pintaba encima de la paleta. -->
  <div class="left-rail">
    <!-- Las capas viven en la misma columna que la paleta, no encima de ella. Antes eran una
         caja absoluta con el mismo `left` y la paleta quedaba debajo. -->
    {#if showLayers && editor}
      <LayersPanel {editor} onClose={() => (showLayers = false)} />
    {/if}
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
              <PiecePreview piece={piece} />
              <span>{piece.label}</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}

    <!-- Los subcircuitos no están en el catálogo estático: existen en el proyecto y cambian
         mientras se edita. Por eso su grupo se pinta aparte y se alimenta de `circuits`. -->
    <div class="palette-group">
      <span class="group-title">Subcircuitos</span>
      {#if otherCircuits.length === 0}
        <p class="palette-hint">
          Crea uno con «+ Subcircuito», añade pines dentro y vuelve aquí para colocarlo como
          una pieza.
        </p>
      {:else}
        <div class="pieces">
          {#each otherCircuits as circuit (circuit.id)}
            <button
              type="button"
              class="piece sub-piece"
              class:active={tool === 'subcircuit' && placeCircuitId === circuit.id}
              title={powered
                ? 'Con la corriente puesta no se edita: apágala para colocar'
                : `Colocar «${circuit.name}» como una pieza`}
              aria-pressed={tool === 'subcircuit' && placeCircuitId === circuit.id}
              disabled={powered}
              onclick={() => chooseSubcircuit(circuit.id)}
            >
              <span class="sub-preview" aria-hidden="true">SUB</span>
              <span class="sub-name">{circuit.name}</span>
            </button>
          {/each}
        </div>
        <p class="palette-hint">Doble clic en una instancia del lienzo para editarla.</p>
      {/if}
    </div>
  </aside>

  <div class="breadcrumb" aria-label="Ruta de circuitos">
    {#each breadcrumb as crumb, i (crumb.id)}
      <span class="crumb" title={crumb.name}>{crumb.id === 'main' ? 'Principal' : crumb.name}</span>
      {#if i < breadcrumb.length - 1}<span class="sep">›</span>{/if}
    {/each}
    <button type="button" class="crumb-btn" onclick={newSubcircuit} disabled={powered} title="Crear y entrar en un subcircuito">+ Subcircuito</button>
    {#if circuitPath.length > 1}
      <button type="button" class="crumb-btn" onclick={goUp} disabled={powered} title="Subir un nivel">↑ Subir</button>
    {/if}
    </div>
  </div>

  {#if isEmpty && !powered}
    <div class="empty-state" aria-live="polite">
      <p class="empty-title">{currentCircuitId === 'main' ? 'Lienzo vacío' : 'Subcircuito vacío'}</p>
      {#if currentCircuitId === 'main'}
        <p class="hint">Elige una pieza de la paleta y haz clic; después cablea arrastrando desde un pin o con dos clics.</p>
      {:else}
        <p class="hint">
          Añade pines de entrada y salida en «Pines de la hoja» para definir la interfaz.
          Después sube con «↑ Subir» y colócalo como una pieza desde «Subcircuitos».
        </p>
      {/if}
      <div class="empty-actions">
        <button type="button" onclick={openFile}>Abrir…</button>
        <button type="button" onclick={loadExample}>Ejemplo</button>
      </div>
      <p class="empty-shortcuts">
        <kbd>S</kbd> seleccionar · <kbd>E</kbd> borrar · <kbd>R</kbd> rotar · <kbd>P</kbd> corriente · <kbd>Ctrl+K</kbd> comandos · <kbd>Ctrl+O</kbd> abrir
      </p>
    </div>
  {/if}

  <div class="status-stack">
    <div class="mode-badge" class:live={powered} aria-live="polite">
      {powered
        ? 'Modo ejecución · solo se pulsan interruptores · para editar'
        : 'Modo edición · para probar el circuito'}
    </div>

    <!-- Diagnóstico de capas. Antes, ocultar la capa principal dejaba el lienzo en blanco
         sin decir nada, y bloquear una capa hacía que no respondieran ni mover ni cablear ni
         los interruptores. Con estos avisos, el motivo se lee y se puede deshacer. -->
    {#if hiddenLayers > 0}
      <div class="info-badge" role="status">
        {#if visibleCount === 0 && !isEmpty}
          Todo el circuito está en capas ocultas ({hiddenLayers}).
        {:else}
          {hiddenLayers} {hiddenLayers === 1 ? 'capa oculta' : 'capas ocultas'}.
        {/if}
        <button type="button" onclick={showAllLayers}>Ver todas</button>
      </div>
    {/if}
    {#if activeLayerLocked && !powered}
      <div class="info-badge" role="status">
        Capa «{activeLayerName}» bloqueada: no se puede editar.
        <button type="button" onclick={unlockActiveLayer}>Desbloquear</button>
      </div>
    {/if}

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
    {#if unsupported > 0}
      <div class="info-badge" role="status">
        {unsupported} {unsupported === 1 ? 'pieza' : 'piezas'} del circuito aún no se {unsupported === 1 ? 'dibuja' : 'dibujan'} (memorias, sensores, matrices o notas). Se conservan y se simulan al guardar.
        <button type="button" aria-label="Ocultar aviso" onclick={() => (unsupported = 0)}>×</button>
      </div>
    {/if}
    {#if openError !== null}
      <div class="error-badge" role="alert">{openError}</div>
    {/if}
    {#if !powered && tool === 'erase'}
      <div class="tool-badge">Borrando · un clic se lleva lo que toques · Esc para salir</div>
    {/if}
    {#if wiring}
      <div class="tool-badge">Cableando · suelta o haz clic en el destino · Esc para cancelar</div>
    {/if}
  </div>

  {#if contextMenu}
    <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => (contextMenu = null)} />
  {/if}

  {#if hasSelection && editor}
    <Inspector {editor} />
  {/if}

  {#if editor && !isEmpty}
    <Minimap {editor} />
  {/if}

  {#if showTruthTable && editor}
    <TruthTablePanel {editor} onClose={() => (showTruthTable = false)} />
  {/if}

  {#if showTestSockets && editor}
    <TestSocketPanel
      elements={editor.diagram.storedElements}
      onClose={() => (showTestSockets = false)}
      onOpenTruthTable={() => {
        showTestSockets = false
        showTruthTable = true
      }}
    />
  {/if}

  {#if showSettings}
    <SettingsPanel
      onClose={() => (showSettings = false)}
      onEditTheme={() => {
        showSettings = false
        showThemeEditor = true
      }}
    />
  {/if}

  {#if showThemeEditor}
    <ThemeEditor onClose={() => (showThemeEditor = false)} />
  {/if}

  {#if showCommandPalette && editor}
    <CommandPalette
      {editor}
      onClose={() => (showCommandPalette = false)}
      extra={[
        { label: 'Abrir circuito…', action: () => void openFile() },
        { label: 'Guardar circuito', action: () => void saveFile() },
        { label: 'Exportar a .CircuitProject (XML)', action: () => void exportXml() },
      ]}
    />
  {/if}

  {#if showConfirmClear}
    <Modal
      title="Vaciar lienzo"
      message="Se borrarán todos los elementos del circuito. Esta acción se puede deshacer con Ctrl+Z."
      confirmLabel="Vaciar"
      danger={true}
      onConfirm={confirmClearAll}
      onCancel={() => (showConfirmClear = false)}
    />
  {/if}

  {#if showConfirmExample}
    <Modal
      title="Cargar ejemplo"
      message="Se reemplazará el circuito actual. Esta acción se puede deshacer con Ctrl+Z."
      confirmLabel="Cargar"
      onConfirm={confirmLoadExample}
      onCancel={() => (showConfirmExample = false)}
    />
  {/if}

  {#if showExamplePicker}
    <ExamplePicker onClose={() => (showExamplePicker = false)} onPick={pickExample} />
  {/if}

  <div class="sim-controls" aria-label="Controles de simulación">
    <button type="button" title="Pausar o reanudar la simulación" onclick={() => { editor?.toggleSimulationPause(); }}>
      {editor?.simulationPaused ? 'Reanudar' : 'Pausar'}
    </button>
    <button type="button" title="Avanzar un tick" onclick={() => { editor?.stepSimulation() }}>
      Paso
    </button>
    <button type="button" title="Añadir una nota de texto" onclick={() => { annotateMode = true; markerMode = false }}>
      Nota
    </button>
    <button type="button" title="Añadir un marcador" onclick={() => { markerMode = true; annotateMode = false }}>
      Marcador
    </button>
    <button type="button" title="Pines de entrada y salida del circuito" onclick={() => (showTestSockets = true)}>
      Sockets
    </button>
    <input
      type="range"
      min="1"
      max="1000"
      step="1"
      value={editor?.simulationFrequency ?? 100}
      title="Velocidad de simulación"
      oninput={(event) => editor?.setSimulationFrequency(Number((event.currentTarget as HTMLInputElement).value))}
    />
    <span class="sim-freq">{editor?.simulationFrequency ?? 100} Hz</span>
  </div>

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

  /* Columna izquierda: el breadcrumb arriba y la paleta debajo, en flujo normal. Antes eran dos
     cajas absolutas en el mismo sitio y el breadcrumb se pintaba encima de la paleta. Aquí no
     pueden solaparse: una empuja a la otra. La columna se desplaza por dentro si no cabe. */
  .left-rail {
    position: absolute;
    top: 3.4rem;
    left: 0.6rem;
    bottom: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: 12.5rem;
    max-width: calc(100% - 1.2rem);
  }

  .palette {
    flex: 0 1 auto;
    min-height: 0;
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

  /* Un subcircuito ocupa toda la fila: su nombre es más largo que el de una compuerta y
     partirlo en dos columnas lo dejaría ilegible. */
  .sub-piece {
    grid-column: 1 / -1;
    display: flex;
    gap: 0.4rem;
    align-items: center;
    text-align: left;
  }

  .sub-preview {
    flex: 0 0 auto;
    padding: 0.05rem 0.25rem;
    border: 1px solid var(--wc-symbol-stroke);
    border-radius: 0.2rem;
    background: var(--wc-symbol-fill);
    color: var(--wc-gate-text);
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .sub-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .palette-hint {
    margin: 0.1rem 0.15rem 0;
    color: var(--fg-muted);
    font-size: 0.68rem;
    line-height: 1.35;
  }

  .palette.disabled .palette-hint {
    opacity: 0.45;
  }

  /* ── Avisos ─────────────────────────────────────────────────────────── */

  /* Todos los avisos de estado viven en la esquina superior derecha, en columna. Alineados
     arriba del todo (a la altura de la barra), que es donde se buscan; y apilados para que el
     de modo, el de error y el de borrador no se pisen entre ellos. */
  .status-stack {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.4rem;
    max-width: min(32rem, calc(100% - 2rem));
    pointer-events: none;
  }

  /* Está siempre puesta, en los dos modos, porque las dos confusiones son simétricas: «¿por
     qué no se enciende nada?» y «¿por qué no puedo mover esto?». El color de «encendido»
     queda para el modo ejecución, que es cuando el circuito está vivo. */
  .mode-badge {
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
    padding: 0.3rem 0.6rem;
    border: 1px solid color-mix(in srgb, var(--wc-state-one) 45%, transparent);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--wc-state-one) 12%, var(--panel-bg));
    font-size: 0.75rem;
    color: var(--fg);
    user-select: none;
    pointer-events: none;
  }

  /* Aviso de sesión recuperada. Tenía estilos prestados de ningún sitio (se dibujaba como un
     bloque suelto): ahora es una tarjeta más del stack, con su botón de cerrar. */
  .info-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid color-mix(in srgb, var(--wc-selection) 45%, transparent);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--wc-selection) 12%, var(--panel-bg));
    font-size: 0.75rem;
    color: var(--fg);
    pointer-events: auto;
  }

  .info-badge button {
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  /* El aviso de que el circuito no se puede simular. Va en rojo de alarma —y no con un color
     del tema— porque un error tiene que gritar igual en los dos temas: no es parte de la
     paleta, es un aviso. Ocupa el sitio del aviso del borrador, que solo sale apagado: un
     circuito que no se simula solo puede ser con la corriente puesta. */
  .error-badge {
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
  /* Va el primero de la columna (`order: -1`) aunque en el HTML vaya detrás de la paleta, para
     no tener que reordenar bloques grandes. Puede envolver si hay muchos niveles: al estar en
     flujo, empuja la paleta hacia abajo en vez de taparla. */
  .breadcrumb {
    order: -1;
    flex: 0 0 auto;
    flex-wrap: wrap;
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
  .empty-state .empty-title { font-size: 1.1rem; font-weight: 600; color: var(--fg) }
  .empty-state .empty-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; pointer-events: auto }
  .empty-state .empty-actions button { padding: 0.4rem 0.8rem; border: 1px solid var(--border); border-radius: 0.35rem; background: var(--panel-bg); color: var(--fg); cursor: pointer }
  .empty-state .empty-shortcuts { font-size: 0.72rem; margin-top: 0.8rem }

  /* ── Medidas ────────────────────────────────────────────────────────── */

  @media (max-width: 768px) {
    .left-rail { width: 10rem }
    .palette { font-size: 0.75rem }
    .toolbar { flex-wrap: wrap; gap: 0.2rem }
    .sim-controls, .hud { left: 11rem }
    .sim-controls { max-width: calc(100% - 19rem) }
  }

  .wire-colors {
    position: absolute;
    top: 3.4rem;
    left: 14rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem;
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    backdrop-filter: blur(6px);
    z-index: 2;
  }
  .wire-colors .swatch {
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    cursor: pointer;
    padding: 0;
  }
  .wire-colors .clear-color {
    min-width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    font-size: 0.75rem;
  }
  .sim-controls {
    position: absolute;
    /* A la derecha de la columna de piezas: el panel se desplaza hasta abajo y estos
       controles no deben taparlo. */
    left: 13.5rem;
    bottom: 2.6rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    max-width: calc(100% - 21.5rem);
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--panel-bg) 85%, transparent);
    font: 0.72rem/1.6 var(--font-mono);
    color: var(--fg-muted);
    z-index: 4;
  }
  .sim-controls button {
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    padding: 0.1rem 0.35rem;
  }
  .sim-controls input {
    width: 6rem;
  }
  .sim-freq {
    min-width: 3.2rem;
    text-align: right;
  }
  .overlay-capture {
    position: absolute;
    inset: 0;
    z-index: 6;
    cursor: crosshair;
  }
  .annotation {
    position: absolute;
    z-index: 7;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: color-mix(in srgb, var(--panel-bg) 90%, transparent);
    color: var(--fg);
    font-size: 0.75rem;
    max-width: 12rem;
    white-space: pre-wrap;
    pointer-events: none;
  }
  .marker {
    position: absolute;
    z-index: 7;
    color: var(--accent);
    font-size: 1.1rem;
    line-height: 1;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .hud {
    position: absolute;
    left: 13.5rem;
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
