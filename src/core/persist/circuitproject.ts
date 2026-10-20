/**
 * Importador/exportador `.CircuitProject` (XML) del original (M4-07, M4-08).
 *
 * **El formato del original es de atributos.** Desde la versión 2.0.0.14 el esquema
 * (`Schema/CircuitProject.xml`) escribe cada campo como un atributo del elemento, no como un
 * hijo con texto. Este módulo lee **las dos formas** —la de atributos y la vieja de hijos—,
 * porque hay ficheros de las dos épocas por ahí, y **escribe la de atributos**, que es la que
 * el original entiende.
 *
 * ⚠️ En el original **una compuerta no se guarda**: no hay tabla `Gate` en el fichero (es
 * `Persistent="False"`). Un símbolo de compuerta es un `<CircuitSymbol>` cuyo `CircuitId` es
 * un GUID que **codifica** el tipo (`GG`), el número de entradas (`II`) y la inversión de la
 * salida (`VV`). Los pines, constantes, repartidores e interruptores sí tienen su tabla, y su
 * símbolo apunta a ella por `CircuitId`. Por eso al importar hay que ir preguntando por cada
 * tabla, y al exportar hay que emitir la tabla correcta además del símbolo.
 */

import { CircuitProject } from '../model/circuit'
import { MAIN_CIRCUIT_ID } from '../model/diagram'
import { isSensorType } from '../model/sensor'
import { DEFAULT_LAYER_ID } from '../model/types'
import type { GateType, MemoryOnStart, PinSide, PinType, Rotation, StoredElement } from '../model/types'

const NS = 'http://LogicCircuit.net/2.0.0.15/CircuitProject.xsd'

/**
 * El tipo de compuerta va codificado en el GUID. El índice es el del `enum GateType` del
 * original, que **no** es el mismo que el nuestro: ahí `0` es `Nop` y `8` es `Led`.
 */
const GATE_GUIDS: readonly (GateType | null)[] = [
  'nop', 'clock', 'not', 'or', 'and', 'xor', 'odd', 'even', 'led', null, 'triState1', 'triState2',
]

const PIN_TYPES: Readonly<Record<string, PinType>> = {
  none: 'none', input: 'input', output: 'output',
  '0': 'none', '1': 'input', '2': 'output',
}

const PIN_SIDES: Readonly<Record<string, PinSide>> = {
  left: 'left', top: 'top', right: 'right', bottom: 'bottom',
  '0': 'left', '1': 'top', '2': 'right', '3': 'bottom',
}

const ROTATIONS: Readonly<Record<string, Rotation>> = {
  up: 'up', right: 'right', down: 'down', left: 'left',
  '0': 'up', '1': 'right', '2': 'down', '3': 'left',
}

// ── Lectura de XML, con soporte para atributos y para hijos con texto ──────

function children(el: globalThis.Element, local: string): globalThis.Element[] {
  const ns = Array.from(el.getElementsByTagNameNS('*', local))
  if (ns.length > 0) return ns
  return Array.from(el.getElementsByTagName(local))
}

/**
 * Las tablas de primer nivel, indexadas por nombre local.
 *
 * `children(root, …)` recorre todo el documento cada vez, y un `.CircuitProject` grande tiene
 * miles de nodos: hacerlo diez veces (una por tabla) era la parte más cara de importar. El
 * esquema del original es plano —cada tabla es hija directa de la raíz—, así que basta una
 * pasada para tenerlas todas.
 */
function rootTables(root: globalThis.Element): Map<string, globalThis.Element[]> {
  const tables = new Map<string, globalThis.Element[]>()
  for (const child of Array.from(root.children)) {
    const name = child.localName
    const list = tables.get(name)
    if (list === undefined) {
      tables.set(name, [child])
    } else {
      list.push(child)
    }
  }
  return tables
}

/** Lee `name`: primero como atributo; si no, como hijo con texto (formato viejo). */
function attr(el: globalThis.Element, name: string): string | null {
  if (el.hasAttribute(name)) return el.getAttribute(name)
  const child = children(el, name)[0]
  return child ? child.textContent?.trim() ?? null : null
}

function numAttr(el: globalThis.Element, name: string, fallback = 0): number {
  const v = attr(el, name)
  if (v === null || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function boolAttr(el: globalThis.Element, name: string, fallback = false): boolean {
  const v = attr(el, name)
  if (v === null || v === '') return fallback
  return v.toLowerCase() === 'true'
}

function decodeGateGuid(guid: string): { gateType: GateType; inputCount: number; invertedOutput: boolean } | null {
  const hex = guid.replace(/-/g, '').toLowerCase()
  if (hex.length !== 32) return null
  const t = Number.parseInt(hex.slice(26, 28), 16)
  const ic = Number.parseInt(hex.slice(28, 30), 16)
  const inv = Number.parseInt(hex.slice(30, 32), 16)
  const gateType = GATE_GUIDS[t]
  if (gateType === null || gateType === undefined || gateType === 'nop') return null
  return { gateType, inputCount: Math.max(1, ic || 1), invertedOutput: inv === 1 }
}

// ── Importar ───────────────────────────────────────────────────────────────

/**
 * Lee un `.CircuitProject` del original y lo trae a nuestro modelo.
 *
 * Se leen **primero** las tablas de dispositivos (pines, constantes, repartidores,
 * interruptores) y los circuitos, y **después** los símbolos, porque un símbolo solo apunta
 * por `CircuitId` a una de esas tablas. Si se recorriera el XML en orden, un símbolo podría
 * llegar antes que su tabla y se perdería.
 */
export function importCircuitProject(xml: string): CircuitProject {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const root = doc.documentElement
  const tables = rootTables(root)
  const table = (name: string): globalThis.Element[] => tables.get(name) ?? []

  // Nombres de los circuitos, para crear los `Circuit` con su nombre real.
  const circuitNames = new Map<string, string>()
  let mainSourceId = ''
  const projectEl = table('Project')[0]
  if (projectEl) {
    mainSourceId = attr(projectEl, 'LogicalCircuitId') ?? ''
  }
  for (const lc of table('LogicalCircuit')) {
    const id = attr(lc, 'LogicalCircuitId')
    if (id === null) continue
    const name = attr(lc, 'Name') ?? (id === mainSourceId ? 'Main' : '')
    circuitNames.set(id, name || (id === mainSourceId ? 'Main' : 'Circuit'))
  }
  // El circuito de arranque es el principal; si el fichero no lo dice, vale cualquiera.
  if (!circuitNames.has(mainSourceId)) {
    mainSourceId = circuitNames.keys().next().value as string | undefined ?? ''
  }

  const project = new CircuitProject('Importado')
  const mainCircuit = project.circuit(MAIN_CIRCUIT_ID)!
  const idMap = new Map<string, string>()
  idMap.set(mainSourceId, MAIN_CIRCUIT_ID)
  if (circuitNames.has(mainSourceId)) {
    mainCircuit.name = circuitNames.get(mainSourceId)!
  }
  for (const [id, name] of circuitNames) {
    if (id === mainSourceId) continue
    idMap.set(id, project.createCircuit({ name }).id)
  }

  // Tablas de dispositivos, indexadas por el id del circuito-símbolo que las representa.
  interface PinInfo { side: PinSide; pinType: PinType; bitWidth: number; inverted: boolean; name: string }
  const pins = new Map<string, PinInfo>()
  for (const pin of table('Pin')) {
    const id = attr(pin, 'PinId')
    if (id === null) continue
    pins.set(id, {
      side: PIN_SIDES[(attr(pin, 'PinSide') ?? 'left').toLowerCase()] ?? 'left',
      pinType: PIN_TYPES[(attr(pin, 'PinType') ?? 'input').toLowerCase()] ?? 'input',
      bitWidth: Math.max(1, numAttr(pin, 'BitWidth', 1)),
      inverted: boolAttr(pin, 'Inverted'),
      name: attr(pin, 'Name') ?? '',
    })
  }

  interface ConstantInfo { bitWidth: number; value: number; pinSide: PinSide }
  const constants = new Map<string, ConstantInfo>()
  for (const c of table('Constant')) {
    const id = attr(c, 'ConstantId')
    if (id === null) continue
    constants.set(id, {
      bitWidth: Math.max(1, numAttr(c, 'BitWidth', 1)),
      value: numAttr(c, 'Value', 0),
      pinSide: PIN_SIDES[(attr(c, 'PinSide') ?? 'right').toLowerCase()] ?? 'right',
    })
  }

  interface SplitterInfo { bitWidth: number; pinCount: number; clockwise: boolean }
  const splitters = new Map<string, SplitterInfo>()
  for (const sp of table('Splitter')) {
    const id = attr(sp, 'SplitterId')
    if (id === null) continue
    splitters.set(id, {
      bitWidth: Math.max(1, numAttr(sp, 'BitWidth', 2)),
      pinCount: Math.max(2, numAttr(sp, 'PinCount', 2)),
      clockwise: boolAttr(sp, 'Clockwise', false),
    })
  }

  interface ButtonInfo { isToggle: boolean; inverted: boolean }
  const buttons = new Map<string, ButtonInfo>()
  for (const b of table('CircuitButton')) {
    const id = attr(b, 'CircuitButtonId')
    if (id === null) continue
    buttons.set(id, { isToggle: boolAttr(b, 'IsToggle'), inverted: boolAttr(b, 'Inverted') })
  }

  interface ProbeInfo { name: string; pinSide: PinSide }
  const probes = new Map<string, ProbeInfo>()
  for (const p of table('CircuitProbe')) {
    const id = attr(p, 'CircuitProbeId')
    if (id === null) continue
    probes.set(id, {
      // El original (`CircuitProbe.CheckName`) sustituye un nombre vacío por el id.
      name: (attr(p, 'Name') ?? '').trim() || id,
      pinSide: PIN_SIDES[(attr(p, 'PinSide') ?? 'left').toLowerCase()] ?? 'left',
    })
  }

  interface SensorInfo {
    sensorType: string
    bitWidth: number
    pinSide: PinSide
    notation: string
    data: string
  }
  const sensors = new Map<string, SensorInfo>()
  for (const s of table('Sensor')) {
    const id = attr(s, 'SensorId')
    if (id === null) continue
    // El esquema del original pone `Random` por defecto; los ficheros viejos pueden no
    // traer el campo (se añadió en la versión 2.0.0.7).
    const rawType = (attr(s, 'SensorType') ?? 'Random').toLowerCase()
    sensors.set(id, {
      sensorType: isSensorType(rawType) ? rawType : 'random',
      bitWidth: Math.max(1, Math.min(32, numAttr(s, 'BitWidth', 1))),
      pinSide: PIN_SIDES[(attr(s, 'PinSide') ?? 'right').toLowerCase()] ?? 'right',
      notation: attr(s, 'Notation') ?? '',
      data: attr(s, 'Data') ?? '',
    })
  }

  interface MemoryInfo {
    addressBitWidth: number
    dataBitWidth: number
    isRom: boolean
    writeOn1: boolean
    onStart: MemoryOnStart
    dualPort: boolean
    data?: string
  }
  const memories = new Map<string, MemoryInfo>()
  for (const m of table('Memory')) {
    const id = attr(m, 'MemoryId')
    if (id === null) continue
    const writable = (attr(m, 'Writable') ?? '').toLowerCase() === 'true'
    memories.set(id, {
      addressBitWidth: Math.max(1, Math.min(16, numAttr(m, 'AddressBitWidth', 4))),
      dataBitWidth: Math.max(1, Math.min(32, numAttr(m, 'DataBitWidth', 4))),
      isRom: !writable,
      writeOn1: (attr(m, 'WriteOn1') ?? '').toLowerCase() === 'true',
      onStart: 'random',
      dualPort: (attr(m, 'DualPort') ?? '').toLowerCase() === 'true',
      data: attr(m, 'Data') ?? undefined,
    })
  }

  const ownerOf = (sourceId: string | null): string => idMap.get(sourceId ?? '') ?? MAIN_CIRCUIT_ID

  // 2) Colocar cada símbolo en su circuito.
  for (const sym of table('CircuitSymbol')) {
    const target = attr(sym, 'CircuitId')
    if (target === null) continue
    const circuit = project.circuit(ownerOf(attr(sym, 'LogicalCircuitId')))
    if (circuit === undefined) continue
    const id = attr(sym, 'CircuitSymbolId') ?? `${circuit.id}-sym-${sym.getAttribute('X')}-${sym.getAttribute('Y')}`
    const position = { x: numAttr(sym, 'X'), y: numAttr(sym, 'Y') }
    const rotation = ROTATIONS[(attr(sym, 'Rotation') ?? 'up').toLowerCase()] ?? 'up'
    const base = { id, circuitId: circuit.id, layerId: DEFAULT_LAYER_ID, position, rotation }

    const element = symbolElement(target, base, pins, constants, splitters, buttons, probes, sensors, memories, idMap)
    if (element) {
      circuit.diagram.importElement(element)
    }
  }

  // 3) Cables.
  for (const w of table('Wire')) {
    const circuit = project.circuit(ownerOf(attr(w, 'LogicalCircuitId')))
    if (circuit === undefined) continue
    const wire: StoredElement = {
      kind: 'wire',
      id: attr(w, 'WireId') ?? `wire-${w.getAttribute('X1')}-${w.getAttribute('Y1')}-${w.getAttribute('X2')}-${w.getAttribute('Y2')}`,
      circuitId: circuit.id,
      layerId: DEFAULT_LAYER_ID,
      p1: { x: numAttr(w, 'X1'), y: numAttr(w, 'Y1') },
      p2: { x: numAttr(w, 'X2'), y: numAttr(w, 'Y2') },
      bitWidth: 1,
    }
    circuit.diagram.importElement(wire)
  }

  project.openCircuit(MAIN_CIRCUIT_ID)
  return project
}

type SymbolBase = {
  readonly id: string
  readonly circuitId: string
  readonly layerId: string
  readonly position: { readonly x: number; readonly y: number }
  readonly rotation: Rotation
}

/** Traduce el `CircuitId` de un símbolo a la pieza que representa (gate, pin, subcircuito…). */
function symbolElement(
  target: string,
  base: SymbolBase,
  pins: Map<string, { side: PinSide; pinType: PinType; bitWidth: number; inverted: boolean; name: string }>,
  constants: Map<string, { bitWidth: number; value: number; pinSide: PinSide }>,
  splitters: Map<string, { bitWidth: number; pinCount: number; clockwise: boolean }>,
  buttons: Map<string, { isToggle: boolean; inverted: boolean }>,
  probes: Map<string, { name: string; pinSide: PinSide }>,
  sensors: Map<string, { sensorType: string; bitWidth: number; pinSide: PinSide; notation: string; data: string }>,
  memories: Map<string, { addressBitWidth: number; dataBitWidth: number; isRom: boolean; data?: string }>,
  idMap: Map<string, string>,
): StoredElement | null {
  const pin = pins.get(target)
  if (pin) {
    return { kind: 'pin', ...base, ...pin }
  }
  const constant = constants.get(target)
  if (constant) {
    return { kind: 'constant', ...base, ...constant }
  }
  const splitter = splitters.get(target)
  if (splitter) {
    return { kind: 'splitter', ...base, ...splitter }
  }
  const probe = probes.get(target)
  if (probe) {
    return { kind: 'probe', ...base, ...probe }
  }
  const sensor = sensors.get(target)
  if (sensor) {
    return { kind: 'sensor', ...base, ...sensor }
  }
  const memory = memories.get(target)
  if (memory) {
    return { kind: 'memory', ...base, ...(memory as Record<string, unknown>) } as StoredElement
  }
  const button = buttons.get(target)
  if (button) {
    return { kind: 'button', ...base, bitWidth: 1, ...button }
  }
  const circuitId = idMap.get(target)
  if (circuitId !== undefined) {
    return { kind: 'circuit', ...base, targetCircuitId: circuitId }
  }
  const gate = decodeGateGuid(target)
  if (gate) {
    return { kind: 'gate', ...base, gateType: gate.gateType, inputCount: gate.inputCount, bitWidth: 1, invertedOutput: gate.invertedOutput }
  }
  return null
}

// ── Exportar ───────────────────────────────────────────────────────────────

/** El GUID que codifica una compuerta (tipo, entradas y salida invertida). */
function gateGuid(gateType: GateType, inputCount: number, invertedOutput: boolean): string {
  const t = GATE_GUIDS.indexOf(gateType)
  const type = (t < 0 ? 0 : t).toString(16).padStart(2, '0')
  const inputs = Math.max(1, inputCount).toString(16).padStart(2, '0')
  const inv = invertedOutput ? '01' : '00'
  return `00000000-0000-0000-0000-000000${type}${inputs}${inv}`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Escribe el proyecto en el formato de atributos del original.
 *
 * Se agrupa por tablas, como el original: primero los circuitos, luego las piezas que son a
 * la vez circuito (pines, constantes, repartidores, interruptores) y por último los símbolos
 * colocados y los cables, que las referencian. Así el fichero se puede volver a cargar
 * respetando las claves ajenas.
 */
export function exportCircuitProject(project: CircuitProject): string {
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="utf-8" standalone="yes"?>')
  lines.push(`<lc:CircuitProject xmlns:lc="${NS}">`)
  lines.push(`  <lc:Project ProjectId="${escapeXml(MAIN_CIRCUIT_ID)}" LogicalCircuitId="${escapeXml(project.currentCircuitId)}" />`)

  for (const c of project.circuitsList) {
    lines.push(`  <lc:LogicalCircuit LogicalCircuitId="${escapeXml(c.id)}" Name="${escapeXml(c.name)}" />`)
  }

  // Piezas que son a la vez circuito (tienen tabla propia).
  for (const c of project.circuitsList) {
    for (const el of c.elements) {
      if (el.kind === 'pin') {
        lines.push(
          `  <lc:Pin PinId="${escapeXml(el.id)}" CircuitId="${escapeXml(c.id)}"` +
            pinAttrs(el.pinType, el.side, el.bitWidth, el.inverted) +
            ` Name="${escapeXml(el.name)}" JamNotation="${escapeXml(el.name)}" />`,
        )
      } else if (el.kind === 'constant') {
        lines.push(
          `  <lc:Constant ConstantId="${escapeXml(el.id)}" BitWidth="${el.bitWidth}" Value="${el.value}"` +
            (el.pinSide === 'right' ? '' : ` PinSide="${sideName(el.pinSide)}"`) +
            ' />',
        )
      } else if (el.kind === 'splitter') {
        lines.push(
          `  <lc:Splitter SplitterId="${escapeXml(el.id)}" BitWidth="${el.bitWidth}" PinCount="${el.pinCount}" Clockwise="${el.clockwise}" />`,
        )
      } else if (el.kind === 'button') {
        lines.push(
          `  <lc:CircuitButton CircuitButtonId="${escapeXml(el.id)}" IsToggle="${el.isToggle}" Inverted="${el.inverted}" />`,
        )
      } else if (el.kind === 'probe') {
        lines.push(
          `  <lc:CircuitProbe CircuitProbeId="${escapeXml(el.id)}" Name="${escapeXml(el.name)}" PinSide="${sideName(el.pinSide)}" />`,
        )
      } else if (el.kind === 'sensor') {
        lines.push(
          `  <lc:Sensor SensorId="${escapeXml(el.id)}" SensorType="${sensorTypeName(el.sensorType)}"` +
            ` BitWidth="${el.bitWidth}" PinSide="${sideName(el.pinSide)}"` +
            ` Notation="${escapeXml(el.notation)}" Data="${escapeXml(el.data)}" />`,
        )
      } else if (el.kind === 'memory') {
        const writable = el.isRom ? 'False' : 'True'
        lines.push(
          `  <lc:Memory MemoryId="${escapeXml(el.id)}" Writable="${writable}" WriteOn1="${el.writeOn1}" DualPort="${el.dualPort}" AddressBitWidth="${el.addressBitWidth}" DataBitWidth="${el.dataBitWidth}"${el.data !== undefined ? ` Data="${escapeXml(el.data)}"` : ''} />`,
        )
      }
    }
  }

  // Símbolos colocados y cables.
  for (const c of project.circuitsList) {
    for (const el of c.elements) {
      if (el.kind === 'wire') {
        lines.push(
          `  <lc:Wire WireId="${escapeXml(el.id)}" LogicalCircuitId="${escapeXml(c.id)}" X1="${el.p1.x}" Y1="${el.p1.y}" X2="${el.p2.x}" Y2="${el.p2.y}" />`,
        )
      } else if (el.kind === 'gate' || el.kind === 'button' || el.kind === 'pin' || el.kind === 'constant' || el.kind === 'probe' || el.kind === 'sensor' || el.kind === 'memory' || el.kind === 'splitter' || el.kind === 'circuit') {
        const symbolId = `${el.id}-sym`
        const rotation = el.rotation === 'up' ? '' : ` Rotation="${rotationName(el.rotation)}"`
        const targetSource =
          el.kind === 'gate' ? gateGuid(el.gateType, el.inputCount, el.invertedOutput) : el.kind === 'circuit' ? el.targetCircuitId : el.id
        lines.push(
          `  <lc:CircuitSymbol CircuitSymbolId="${escapeXml(symbolId)}" CircuitId="${escapeXml(targetSource)}" LogicalCircuitId="${escapeXml(c.id)}" X="${el.position.x}" Y="${el.position.y}"${rotation} />`,
        )
      }
    }
  }

  lines.push('</lc:CircuitProject>')
  return lines.join('\n')
}

function pinAttrs(pinType: PinType, side: PinSide, bitWidth: number, inverted: boolean): string {
  let out = ''
  if (pinType !== 'input') out += ` PinType="${pinType === 'none' ? 'None' : 'Output'}"`
  if (side !== 'left') out += ` PinSide="${sideName(side)}"`
  if (bitWidth !== 1) out += ` BitWidth="${bitWidth}"`
  if (inverted) out += ' Inverted="true"'
  return out
}

function sideName(side: PinSide): string {
  return side.charAt(0).toUpperCase() + side.slice(1)
}

/** El nombre del tipo tal y como lo escribe el original. */
function sensorTypeName(type: string): string {
  switch (type.toLowerCase()) {
    case 'series':
      return 'Series'
    case 'loop':
      return 'Loop'
    case 'manual':
      return 'Manual'
    case 'keycode':
      return 'KeyCode'
    case 'ascii':
      return 'ASCII'
    case 'sequence':
      return 'Sequence'
    case 'clock':
      return 'Clock'
    default:
      return 'Random'
  }
}

function rotationName(rotation: Rotation): string {
  return rotation.charAt(0).toUpperCase() + rotation.slice(1)
}
