/**
 * Formato JSON nativo de WebCircuits (M4-05, M4-06).
 *
 * Es el formato propio del proyecto: un JSON con número de versión desde el día 1,
 * para poder migrar sin romper ficheros antiguos. El `.CircuitProject` (XML) del
 * original se importa/exporta aparte (M4-07/M4-08).
 *
 * Todo el modelo se serializa tal cual: cada circuito es una lista de elementos
 * (símbodos colocados y cables), igual que en el original.
 */

import type { Circuit } from '../model/circuit'
import { CircuitProject } from '../model/circuit'
import { MAIN_CIRCUIT_ID } from '../model/diagram'
import type { Element, GridPoint } from '../model/types'

export const FORMAT_NAME = 'webcircuits'
export const FORMAT_VERSION = 1

export interface SerializedProject {
  readonly format: string
  readonly version: number
  readonly name: string
  readonly currentCircuitId: string
  readonly circuits: readonly SerializedCircuit[]
}

export interface SerializedCircuit {
  readonly id: string
  readonly name: string
  readonly elements: readonly SerializedElement[]
}

export type SerializedElement = Record<string, unknown> & { readonly kind: string }

function point(p: GridPoint): { x: number; y: number } {
  return { x: p.x, y: p.y }
}

function serializeElement(el: Element): SerializedElement {
  const base = {
    kind: el.kind,
    id: el.id,
    circuitId: el.circuitId,
    layerId: el.layerId,
  }
  if (el.kind === 'wire') {
    return { ...base, p1: point(el.p1), p2: point(el.p2), bitWidth: el.bitWidth }
  }
  // dispositivo colocado
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
    default:
      return dev
  }
}

function serializeCircuit(c: Circuit): SerializedCircuit {
  return {
    id: c.id,
    name: c.name,
    elements: c.elements.map(serializeElement),
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

function deserializeElement(raw: SerializedElement): Element {
  const base = {
    id: raw.id as string,
    circuitId: raw.circuitId as string,
    layerId: (raw.layerId as string) ?? 'principal',
  }
  if (raw.kind === 'wire') {
    return {
      kind: 'wire',
      ...base,
      p1: asPoint(raw.p1),
      p2: asPoint(raw.p2),
      bitWidth: (raw.bitWidth as number) ?? 1,
    } as Element
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
      } as Element
    case 'button':
      return {
        kind: 'button',
        ...deviceBase,
        bitWidth: (raw.bitWidth as number) ?? 1,
        isToggle: (raw.isToggle as boolean) ?? false,
        inverted: (raw.inverted as boolean) ?? false,
      } as Element
    default:
      throw new Error(`Elemento desconocido: ${raw.kind}`)
  }
}

export function deserializeProject(json: string): CircuitProject {
  const data = JSON.parse(json) as SerializedProject
  if (data.format !== FORMAT_NAME) {
    throw new Error(`Formato desconocido: ${data.format}`)
  }
  if (data.version !== FORMAT_VERSION) {
    throw new Error(`Versión no soportada: ${data.version} (se esperaba ${FORMAT_VERSION})`)
  }
  const project = new CircuitProject(data.name)
  // Reemplazar el circuito principal por el deserializado.
  // CircuitProject no expone setters de elementos; reconstruimos añadiendo.
  // Primero vaciamos el principal.
  const main = project.circuit(project.currentCircuitId)!
  // Limpiar el principal.
  for (const el of [...main.diagram.elements]) {
    main.diagram.remove(el.id)
  }
  const idMap = new Map<string, string>()
  for (const sc of data.circuits) {
    if (sc.id === MAIN_CIRCUIT_ID || sc.id === project.currentCircuitId) {
      for (const el of sc.elements) {
        const e = deserializeElement(el)
        main.diagram.importElement({ ...e, circuitId: main.id } as Element)
      }
    } else {
      const created = project.createCircuit({ name: sc.name })
      idMap.set(sc.id, created.id)
      for (const el of sc.elements) {
        const e = deserializeElement(el)
        created.diagram.importElement({ ...e, circuitId: created.id } as Element)
      }
    }
  }
  if (data.currentCircuitId && data.currentCircuitId !== project.currentCircuitId) {
    const mapped = idMap.get(data.currentCircuitId) ?? data.currentCircuitId
    project.openCircuit(mapped)
  }
  return project
}