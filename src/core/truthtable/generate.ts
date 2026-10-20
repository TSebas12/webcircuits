/**
 * Generador de tablas de verdad (M8-06).
 *
 * El original no simula el circuito tal cual: hace una **copia** y cambia los pines de
 * entrada por constantes y los de salida por probetas (`CircuitTestSocket`). Así puede
 * forzar cada combinación sin tocar el dibujo y leer la salida como un valor más.
 *
 * Aquí se hace lo mismo con una diferencia: en vez de crear una probeta visible, se marca
 * el pin de salida como consumidor y se leen los índices de estado de su cable. El resultado
 * es el mismo y no hace falta que exista todavía el dispositivo de probeta (M2-12).
 */
import { CircuitMap } from '../simulate/circuit-map'
import { State } from '../function/state'
import type { FunctionConstant } from '../function/devices'
import { CircuitProject } from '../model/circuit'
import { MAIN_CIRCUIT_ID } from '../model/diagram'
import type { Circuit } from '../model/types'
import { projectIndex } from '../model/symbol'
import type { Constant, Id, Pin, PinSide, StoredElement } from '../model/types'
import { CircuitError } from '../circuit-error'
import { ExpressionParser } from '../expression-parser'
import { DEFAULT_MAX_ROWS, type TruthState, type TruthTable, type TruthTableOptions } from './truth-state'

interface InputSocket {
  readonly pin: Pin
  readonly constant: Constant
}

interface ClonedCircuit {
  readonly project: CircuitProject
  readonly root: Circuit
  readonly inputs: readonly InputSocket[]
  readonly outputs: readonly Pin[]
}

/** El lado interior de un pin de hoja: por donde entra o sale el cable. */
function innerSide(pin: Pin): PinSide {
  return pin.pinType === 'input' ? 'right' : 'left'
}

/** Compara pines por posición, como el `PinComparer` del original. */
function byPosition(a: Pin, b: Pin): number {
  return a.position.y - b.position.y || a.position.x - b.position.x
}

/**
 * Copia el proyecto y sustituye los pines de entrada del circuito pedido por constantes.
 *
 * La copia es necesaria: la simulación de la tabla no puede cambiar el documento que el
 * usuario tiene abierto. Los ids de los circuitos se reasignan para que dos proyectos no
 * compartan referencias, y los subcircuitos se remapean igual que al cargar un fichero.
 */
function cloneWithSockets(project: CircuitProject, circuit: Circuit): ClonedCircuit {
  const clone = new CircuitProject(project.name)
  const idMap = new Map<Id, Id>([[MAIN_CIRCUIT_ID, MAIN_CIRCUIT_ID]])

  for (const source of project.circuitsList) {
    if (source.id === MAIN_CIRCUIT_ID) continue
    const created = clone.createCircuit({ name: source.name })
    idMap.set(source.id, created.id)
  }

  const inputs: InputSocket[] = []
  const outputs: Pin[] = []

  for (const source of project.circuitsList) {
    const target = clone.circuit(idMap.get(source.id) ?? MAIN_CIRCUIT_ID)
    if (target === undefined) {
      throw new CircuitError(`No se pudo copiar el circuito «${source.name}».`)
    }
    target.diagram.setLayers([...source.diagram.layersList])

    for (const element of source.elements) {
      if (element.kind === 'wire') {
        target.diagram.importElement({ ...element, circuitId: target.id })
        continue
      }

      if (source.id === circuit.id && element.kind === 'pin' && element.pinType === 'input') {
        const socket: Constant = {
          kind: 'constant',
          id: `socket-${element.id}`,
          circuitId: target.id,
          layerId: element.layerId,
          position: element.position,
          rotation: element.rotation,
          bitWidth: element.bitWidth,
          value: 0,
          // El pin de entrada tiene su punta interior a la derecha, aunque la caja del
          // circuito lo dibuje a la izquierda. La constante ocupa su sitio exacto.
          pinSide: innerSide(element),
        }
        target.diagram.importElement(socket)
        inputs.push({ pin: element, constant: socket })
        continue
      }

      if (element.kind === 'circuit') {
        const mapped = idMap.get(element.targetCircuitId) ?? element.targetCircuitId
        target.diagram.importElement({
          ...element,
          circuitId: target.id,
          targetCircuitId: mapped,
        })
        continue
      }

      const copied: StoredElement = { ...element, circuitId: target.id }
      target.diagram.importElement(copied)
      if (source.id === circuit.id && element.kind === 'pin' && element.pinType === 'output') {
        outputs.push(element)
      }
    }
  }

  const root = clone.circuit(idMap.get(circuit.id) ?? MAIN_CIRCUIT_ID)
  if (root === undefined) {
    throw new CircuitError(`No se pudo copiar el circuito «${circuit.name}».`)
  }

  inputs.sort((a, b) => byPosition(a.pin, b.pin))
  outputs.sort(byPosition)
  return { project: clone, root, inputs, outputs }
}

interface InputRuntime {
  readonly pin: Pin
  readonly function: FunctionConstant
}

interface OutputRuntime {
  readonly pin: Pin
  readonly indexes: readonly number[]
}

/**
 * Genera todas las combinaciones de entrada del circuito.
 *
 * Lanza `CircuitError` si el filtro no compila, si el circuito oscila o si tiene más
 * entradas de las que se pueden enumerar con seguridad.
 */
export function generateTruthTable(
  project: CircuitProject,
  circuit: Circuit,
  options: TruthTableOptions = {},
): TruthTable {
  const maxRows = Math.max(1, options.maxRows ?? DEFAULT_MAX_ROWS)
  const cloned = cloneWithSockets(project, circuit)

  const index = projectIndex({
    id: cloned.project.name,
    name: cloned.project.name,
    circuits: cloned.project.circuitsList,
    mainCircuitId: cloned.root.id,
  })
  const map = CircuitMap.create(index, cloned.root)
  const state = map.apply(0)

  const inputs: InputRuntime[] = []
  for (const socket of cloned.inputs) {
    const symbol = index.symbol(socket.constant)
    const function_ = map.functionConstant(symbol)
    if (function_ !== null) {
      inputs.push({ pin: socket.pin, function: function_ })
    }
  }

  const outputs: OutputRuntime[] = []
  for (const pin of cloned.outputs) {
    const symbol = index.symbol(pin)
    const jam = symbol.jams[0]
    if (jam === undefined) continue
    const indexes = map.stateIndexesAtPoint(jam.point, 0, pin.bitWidth)
    if (indexes.length === pin.bitWidth) {
      outputs.push({ pin, indexes })
    }
  }

  const inputPins = inputs.map((input) => ({
    id: input.pin.id,
    name: input.pin.name || input.pin.id,
    bitWidth: input.pin.bitWidth,
  }))
  const outputPins = outputs.map((output) => ({
    id: output.pin.id,
    name: output.pin.name || output.pin.id,
    bitWidth: output.pin.bitWidth,
  }))

  if (inputs.length === 0 || outputs.length === 0) {
    return { inputs: inputPins, outputs: outputPins, rows: [], truncated: false, totalRows: 0 }
  }

  const inputBits = inputs.reduce((sum, input) => sum + input.pin.bitWidth, 0)
  if (inputBits > 30) {
    throw new CircuitError(
      `La tabla de verdad no puede enumerar ${inputBits} bits de entrada de una vez. ` +
        'Reduce el número de pines o su ancho.',
    )
  }

  const total = 1n << BigInt(inputBits)
  const totalRows = Number(total)

  let predicate: ((row: TruthState) => boolean) | null = null
  const filter = options.filter?.trim() ?? ''
  if (filter !== '') {
    const parser = new ExpressionParser({
      inputs: inputPins.map((pin) => pin.name),
      outputs: outputPins.map((pin) => pin.name),
    })
    predicate = parser.parsePredicate(filter, options.invertFilter ?? false)
    if (predicate === null) {
      throw new CircuitError(parser.errorText.trim() || 'El filtro de la tabla no es válido.')
    }
  }

  const rows: TruthState[] = []
  let truncated = false
  let lastProgress = -1

  for (let combination = 0n; combination < total; combination += 1n) {
    if (rows.length >= maxRows || options.keepGoing?.() === false) {
      truncated = true
      break
    }

    // El original asigna los bits de la combinación de la última entrada a la primera:
    // así la primera columna es la de mayor peso. Se conserva ese orden para que las
    // tablas salgan iguales que en LogicCircuit.
    let assignedBits = 0n
    for (let i = inputs.length - 1; i >= 0; i -= 1) {
      const input = inputs[i]
      if (input === undefined) continue
      const mask = (1n << BigInt(input.pin.bitWidth)) - 1n
      input.function.value = Number((combination >> assignedBits) & mask)
      assignedBits += BigInt(input.pin.bitWidth)
    }

    if (!state.evaluate(true)) {
      throw new CircuitError(
        `El circuito «${circuit.name}» oscila y no se puede tabular con valores estables.`,
      )
    }

    const inputValues = inputs.map((input) => input.function.value)
    const outputValues: number[] = []
    let valid = true

    for (const output of outputs) {
      let value = 0
      for (let bit = 0; bit < output.pin.bitWidth; bit += 1) {
        const index_ = output.indexes[bit]
        const signal = index_ === undefined ? State.Off : state.get(index_)
        if (signal === State.On1) {
          value += 2 ** bit
        } else if (signal !== State.On0) {
          valid = false
          break
        }
      }
      if (!valid) break
      outputValues.push(value)
    }

    if (valid) {
      const row: TruthState = { input: inputValues, output: outputValues }
      if (predicate === null || predicate(row)) {
        rows.push(row)
      }
    }

    if (options.onProgress !== undefined) {
      const step = Math.max(1, Math.floor(totalRows / 100))
      if (Number(combination) - lastProgress >= step || combination + 1n === total) {
        lastProgress = Number(combination)
        options.onProgress(Number(combination + 1n) / totalRows)
      }
    }
  }

  return { inputs: inputPins, outputs: outputPins, rows, truncated, totalRows }
}

/** Exporta una tabla a CSV, con cabecera y valores en hexadecimal. */
export function truthTableToCsv(table: TruthTable): string {
  const header = [...table.inputs, ...table.outputs].map((pin) => escapeCsv(pin.name))
  const lines = [header.join(',')]
  for (const row of table.rows) {
    const values = [...row.input, ...row.output].map((value) => value.toString(16).toUpperCase())
    lines.push(values.join(','))
  }
  return lines.join('\r\n')
}

/** Exporta una tabla a HTML autónomo, sin depender de la aplicación. */
export function truthTableToHtml(table: TruthTable): string {
  const head = [...table.inputs, ...table.outputs]
  const columns = head.map((pin) => `<th>${escapeHtml(pin.name)}</th>`).join('')
  const body = table.rows
    .map((row) => {
      const cells = [...row.input, ...row.output]
        .map((value) => `<td>${value.toString(16).toUpperCase()}</td>`)
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<title>Tabla de verdad</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem}
table{border-collapse:collapse}
th,td{border:1px solid #999;padding:.25rem .6rem;text-align:right}
th{background:#eee}
</style>
<table>
<thead><tr>${columns}</tr></thead>
<tbody>
${body}
</tbody>
</table>
</html>`
}

function escapeCsv(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
