/**
 * Trabajador de la tabla de verdad (M8).
 *
 * El recorrido de todas las combinaciones es síncrono y puede tardar. Hacerlo en el hilo
 * principal congelaba la ventana y dejaba el botón «Detener» sin efecto hasta terminar. En un
 * worker el panel sigue respondiendo y cancelar es `terminate()`, que interrumpe de verdad.
 */
import { deserializeProject } from '../../../core/persist/json'
import { generateTruthTable } from '../../../core/truthtable/generate'

interface Request {
  readonly project: string
  readonly maxRows: number
  readonly filter: string
  readonly invertFilter: boolean
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage: (message: unknown) => void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event: MessageEvent<Request>) => {
  const { project: json, maxRows, filter, invertFilter } = event.data
  try {
    const project = deserializeProject(json)
    const circuit = project.current
    const table = generateTruthTable(project, circuit, {
      maxRows,
      filter,
      invertFilter,
      onProgress: (value) => {
        scope.postMessage({ type: 'progress', value })
      },
    })
    scope.postMessage({ type: 'done', table })
  } catch (cause) {
    scope.postMessage({
      type: 'error',
      message: cause instanceof Error ? cause.message : String(cause),
    })
  }
}
