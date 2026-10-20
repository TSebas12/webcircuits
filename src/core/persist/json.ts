/**
 * Formato JSON nativo de WebCircuits (M4-05, M4-06).
 */

import type { Circuit } from '../model/circuit'
import { CircuitProject } from '../model/circuit'
import { MAIN_CIRCUIT_ID } from '../model/diagram'
import { DEFAULT_LAYER_ID } from '../model/types'
import type { CircuitAnnotation, CircuitMarker } from '../model/overlay'
import type { GridPoint, Layer, PinSide, PinType, StoredElement } from '../model/types'

export const FORMAT_NAME = 'webcircuits'
export const FORMAT_VERSION = 1

export interface SerializedProject {
  readonly format: string
  readonly version: number
  readonly name: string
  readonly currentCircuitId: string
  readonly circuits: readonly SerializedCircuit[]
}

export interface SerializedAnnotation {
  readonly id: string
  readonly position: { readonly x: number; readonly y: number }
  readonly text: string
}

export interface SerializedMarker {
  readonly id: string
  readonly position: { readonly x: number; readonly y: number }
  readonly label: string
}

export interface SerializedCircuit {
  readonly id: string
  readonly name: string
  readonly elements: readonly SerializedElement[]
  readonly layers?: readonly Layer[]
  readonly annotations?: readonly SerializedAnnotation[]
  readonly markers?: readonly SerializedMarker[]
}

export type SerializedElement = Record<string, unknown> & { readonly kind: string }

function point(p: GridPoint): { x: number; y: number } {
  return { x: p.x, y: p.y }
}

function serializeElement(el: StoredElement): SerializedElement {
  const base = {
    kind: el.kind,
    id: el.id,
    circuitId: el.circuitId,
    layerId: el.layerId,
  }
  if (el.kind === 'wire') {
    return {
      ...base,
      p1: point(el.p1),
      p2: point(el.p2),
      bitWidth: el.bitWidth,
      // Solo se escribe si existe: los ficheros de antes no llevan la clave.
      ...(el.color !== undefined ? { color: el.color } : {}),
    }
  }
  const dev = {
    ...base,
    position: point(el.position),
    rotation: el.rotation,
  }
  switch (el.kind) {
    case 'gate':
      return { ...dev, gateType: el.gateType, inputCount: el.inputCount, bitWidth: el.bitWidth, invertedOutput: el.invertedOutput }
    case 'button':
      return { ...dev, bitWidth: el.bitWidth, isToggle: el.isToggle, inverted: el.inverted }
    case 'pin':
      return { ...dev, pinType: el.pinType, side: el.side, bitWidth: el.bitWidth, inverted: el.inverted, name: el.name }
    case 'constant':
      return { ...dev, bitWidth: el.bitWidth, value: el.value, pinSide: el.pinSide }
    case 'probe':
      return { ...dev, name: el.name, pinSide: el.pinSide }
    case 'sensor':
      return {
        ...dev,
        sensorType: el.sensorType,
        bitWidth: el.bitWidth,
        pinSide: el.pinSide,
        notation: el.notation,
        data: el.data,
      }
    case 'memory':
      return {
        ...dev,
        addressBitWidth: el.addressBitWidth,
        dataBitWidth: el.dataBitWidth,
        isRom: el.isRom,
        data: el.data,
      }
    case 'splitter':
      return { ...dev, bitWidth: el.bitWidth, pinCount: el.pinCount, clockwise: el.clockwise }
    case 'circuit':
      return { ...dev, targetCircuitId: el.targetCircuitId }
    default:
      return dev
  }
}

function serializeCircuit(c: Circuit): SerializedCircuit {
  const annotations = c.diagram.annotations
  const markers = c.diagram.markers
  return {
    id: c.id,
    name: c.name,
    elements: c.elements.map(serializeElement),
    layers: [...c.diagram.layersList],
    ...(annotations.length > 0
      ? {
          annotations: annotations.map((note) => ({
            id: note.id,
            position: point(note.position),
            text: note.text,
          })),
        }
      : {}),
    ...(markers.length > 0
      ? {
          markers: markers.map((marker) => ({
            id: marker.id,
            position: point(marker.position),
            label: marker.label,
          })),
        }
      : {}),
  }
}

export function serializeProject(project: CircuitProject): string {
  const data: SerializedProject = {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    name: project.name,
    currentCircuitId: project.currentCircuitId,
    circuits: project.circuitsList.map(serializeCircuit),
  }
  return JSON.stringify(data, null, 2)
}

function asPoint(v: unknown): GridPoint {
  const o = v as { x: number; y: number }
  return { x: o.x, y: o.y }
}

const PIN_TYPES: Readonly<Record<string, PinType>> = {
  input: 'input',
  output: 'output',
  none: 'none',
  Input: 'input',
  Output: 'output',
  None: 'none',
}

const PIN_SIDES: Readonly<Record<string, PinSide>> = {
  left: 'left',
  right: 'right',
  top: 'top',
  bottom: 'bottom',
  Left: 'left',
  Right: 'right',
  Top: 'top',
  Bottom: 'bottom',
}

function asPinType(v: unknown): PinType {
  return PIN_TYPES[String(v)] ?? 'input'
}

function asPinSide(v: unknown): PinSide {
  return PIN_SIDES[String(v)] ?? 'right'
}

function deserializeElement(raw: SerializedElement): StoredElement {
  const base = {
    id: raw.id as string,
    circuitId: raw.circuitId as string,
    layerId: (raw.layerId as string) ?? DEFAULT_LAYER_ID,
  }
  if (raw.kind === 'wire') {
    return {
      kind: 'wire',
      ...base,
      p1: asPoint(raw.p1),
      p2: asPoint(raw.p2),
      bitWidth: (raw.bitWidth as number) ?? 1,
      ...(typeof raw.color === 'string' ? { color: raw.color } : {}),
    }
  }
  const position = asPoint(raw.position)
  const rotation = raw.rotation as 'up' | 'right' | 'down' | 'left'
  const deviceBase = { ...base, position, rotation }
  switch (raw.kind) {
    case 'gate':
      return {
        kind: 'gate',
        ...deviceBase,
        gateType: raw.gateType as never,
        inputCount: raw.inputCount as number,
        bitWidth: (raw.bitWidth as number) ?? 1,
        invertedOutput: (raw.invertedOutput as boolean) ?? false,
      }
    case 'button':
      return {
        kind: 'button',
        ...deviceBase,
        bitWidth: (raw.bitWidth as number) ?? 1,
        isToggle: (raw.isToggle as boolean) ?? false,
        inverted: (raw.inverted as boolean) ?? false,
      }
    case 'pin':
      return {
        kind: 'pin',
        ...deviceBase,
        pinType: asPinType(raw.pinType),
        side: asPinSide(raw.side),
        bitWidth: (raw.bitWidth as number) ?? 1,
        inverted: (raw.inverted as boolean) ?? false,
        name: (raw.name as string) ?? '',
      }
    case 'constant':
      return {
        kind: 'constant',
        ...deviceBase,
        bitWidth: (raw.bitWidth as number) ?? 1,
        value: (raw.value as number) ?? 0,
        pinSide: asPinSide(raw.pinSide),
      }
    case 'probe':
      return {
        kind: 'probe',
        ...deviceBase,
        name: (raw.name as string) ?? '',
        pinSide: asPinSide(raw.pinSide),
      }
    case 'sensor':
      return {
        kind: 'sensor',
        ...deviceBase,
        sensorType: (raw.sensorType as string) ?? 'random',
        bitWidth: (raw.bitWidth as number) ?? 1,
        pinSide: asPinSide(raw.pinSide),
        notation: (raw.notation as string) ?? '',
        data: (raw.data as string) ?? '',
      }
    case 'memory':
      return {
        kind: 'memory',
        ...deviceBase,
        addressBitWidth: (raw.addressBitWidth as number) ?? 4,
        dataBitWidth: (raw.dataBitWidth as number) ?? 4,
        isRom: (raw.isRom as boolean) ?? false,
        data: raw.data as string | undefined,
      }
    case 'splitter':
      return {
        kind: 'splitter',
        ...deviceBase,
        bitWidth: (raw.bitWidth as number) ?? 1,
        pinCount: (raw.pinCount as number) ?? 2,
        clockwise: (raw.clockwise as boolean) ?? true,
      }
    case 'circuit':
      return {
        kind: 'circuit',
        ...deviceBase,
        targetCircuitId: raw.targetCircuitId as string,
      }
    default:
      throw new Error(`Elemento desconocido: ${raw.kind}`)
  }
}

/**
 * Carga un proyecto del formato nativo.
 *
 * Los circuitos se crean **primero** todos y después se rellenan, para poder reescribir las
 * referencias entre ellos (`circuitId` y el `targetCircuitId` de un subcircuito): al cargar,
 * cada circuito recibe un id nuevo, y sin este reescrito los subcircuitos apuntarían a ids
 * que ya no existen. Era un fallo silencioso de M4-11.
 */
export function deserializeProject(json: string): CircuitProject {
  const data = JSON.parse(json) as SerializedProject
  if (data.format !== FORMAT_NAME) {
    throw new Error(`Formato desconocido: ${data.format}`)
  }
  if (data.version > FORMAT_VERSION) {
    throw new Error(`Versión no soportada: ${data.version} (esta versión llega a ${FORMAT_VERSION})`)
  }
  const project = new CircuitProject(data.name)
  const mainId = MAIN_CIRCUIT_ID
  const idMap = new Map<string, string>([[mainId, mainId]])

  // 1) Crear todos los circuitos y mapear id viejo → id nuevo.
  for (const sc of data.circuits) {
    if (sc.id === mainId) {
      continue
    }
    const created = project.createCircuit({ name: sc.name })
    idMap.set(sc.id, created.id)
  }

  // 2) Rellenar cada circuito ya con el mapa completo (las referencias cruzadas ya resuelven).
  for (const sc of data.circuits) {
    const circuit = project.circuit(idMap.get(sc.id) ?? mainId)
    if (circuit === undefined) {
      continue
    }
    // Las capas van **antes** que los elementos: `importElement` decide si el `layerId` que
    // trae el fichero existe, y para eso la lista tiene que estar ya cargada. Si no, un
    // elemento de una capa secundaria se recolocaría en la principal por error.
    // Se normaliza siempre, aunque el fichero no traiga capas: los elementos sin `layerId`
    // (ficheros anteriores a M5) caen en la principal y no quedan invisibles e inalcanzables.
    circuit.diagram.setLayers((sc.layers ?? []) as Layer[])
    const annotations: CircuitAnnotation[] = (sc.annotations ?? []).map((note) => ({
      id: note.id,
      position: asPoint(note.position),
      text: note.text,
    }))
    const markers: CircuitMarker[] = (sc.markers ?? []).map((marker) => ({
      id: marker.id,
      position: asPoint(marker.position),
      label: marker.label,
    }))
    circuit.diagram.setOverlays(annotations, markers)
    for (const el of sc.elements) {
      const mapped = {
        ...deserializeElement(el),
        circuitId: circuit.id,
      } as StoredElement
      if (mapped.kind === 'circuit') {
        const target = idMap.get(mapped.targetCircuitId)
        circuit.diagram.importElement(target ? { ...mapped, targetCircuitId: target } : mapped)
      } else {
        circuit.diagram.importElement(mapped)
      }
    }
  }

  if (data.currentCircuitId) {
    project.openCircuit(idMap.get(data.currentCircuitId) ?? mainId)
  }
  return project
}