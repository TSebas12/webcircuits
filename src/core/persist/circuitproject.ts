/**
 * Importador/exportador `.CircuitProject` (XML) del original (M4-07, M4-08).
 *
 * El formato es el del original (namespace `http://LogicCircuit.net/.../CircuitProject.xsd`).
 * Los identificadores son GUIDs; las compuertas se codifican como CircuitSymbols cuyo
 * CircuitId es un GUID especial cuyos últimos bytes dicen el tipo y el número de entradas.
 *
 * ⚠️ Usa `DOMParser`, que es API del navegador: se acepta aquí porque el plan (M4-07)
 * lo pide así y los tests corren en jsdom. Si se quiere mover a core puro, habría que
 * sustituirlo por un parser XML propio.
 */

import { CircuitProject } from '../model/circuit'
import { MAIN_CIRCUIT_ID } from '../model/diagram'
import type { GateType } from '../model/types'

const NS = 'http://LogicCircuit.net/2.0.0.7/CircuitProject.xsd'

const GATE_TYPES: GateType[] = [
  'nop', 'clock', 'not', 'or', 'and', 'xor', 'odd', 'even', 'led', 'probe', 'triState1', 'triState2',
]

function text(parent: globalThis.Element, tag: string): string | null {
  const el = parent.getElementsByTagNameNS(NS, tag)[0] ?? parent.getElementsByTagName(tag)[0]
  return el ? el.textContent?.trim() ?? null : null
}

function num(parent: globalThis.Element, tag: string, fallback = 0): number {
  const v = text(parent, tag)
  return v === null ? fallback : Number(v)
}

function decodeGateGuid(guid: string): { gateType: GateType; inputCount: number; invertedOutput: boolean } | null {
  const hex = guid.replace(/-/g, '')
  if (hex.length !== 32) return null
  const t = parseInt(hex.slice(26, 28), 16)
  const ic = parseInt(hex.slice(28, 30), 16)
  const inv = parseInt(hex.slice(30, 32), 16)
  if (t < 0 || t >= GATE_TYPES.length) return null
  const gateType = GATE_TYPES[t]!
  if (gateType === 'nop') return null
  return { gateType, inputCount: Math.max(1, ic || 1), invertedOutput: inv === 1 }
}

export function importCircuitProject(xml: string): CircuitProject {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const root = doc.documentElement
  const NS_LOCAL = root.namespaceURI ?? NS

  function q(tag: string): globalThis.Element[] {
    const a = Array.from(root.getElementsByTagNameNS(NS_LOCAL, tag))
    if (a.length > 0) return a as unknown as globalThis.Element[]
    return Array.from(root.getElementsByTagName(tag)) as unknown as globalThis.Element[]
  }

  // LogicalCircuits
  const circuits = new Map<string, { name: string }>()
  let mainId = ''
  const projectEl = q('Project')[0]
  if (projectEl) {
    mainId = text(projectEl, 'LogicalCircuitId') ?? ''
  }
  for (const lc of q('LogicalCircuit')) {
    const id = text(lc, 'LogicalCircuitId')!
    const name = text(lc, 'Name') ?? (id === mainId ? 'Main' : 'Circuit')
    circuits.set(id, { name })
  }

  const project = new CircuitProject('Importado')

  // Mapeo de circuit id original -> nuestro Circuit
  const circuitMap = new Map<string, ReturnType<CircuitProject['circuit']>>()
  // principal
  const mainCircuit = project.circuit(project.currentCircuitId)!
  if (mainId && circuits.has(mainId)) {
    mainCircuit.name = circuits.get(mainId)!.name
  }
  circuitMap.set(mainId, mainCircuit)

  for (const [id, info] of circuits) {
    if (id === mainId) continue
    const created = project.createCircuit({ name: info.name })
    circuitMap.set(id, created)
  }

  // Pin map: id -> { circuitId, name, pinType, side, bitWidth }
  const pinMap = new Map<string, { circuitId: string; name: string; pinType: string; side: string; bitWidth: number }>()
  for (const pin of q('Pin')) {
    pinMap.set(text(pin, 'PinId')!, {
      circuitId: text(pin, 'CircuitId')!,
      name: text(pin, 'Name') ?? '',
      pinType: text(pin, 'PinType') ?? 'Input',
      side: text(pin, 'PinSide') ?? 'Left',
      bitWidth: num(pin, 'BitWidth', 1) || 1,
    })
  }

  // Constant map
  const constantMap = new Map<string, { value: number; bitWidth: number }>()
  for (const c of q('Constant')) {
    constantMap.set(text(c, 'ConstantId')!, {
      value: num(c, 'Value', 0),
      bitWidth: num(c, 'BitWidth', 1) || 1,
    })
  }

  // Splitter map
  const splitterMap = new Map<string, { bitWidth: number; pinCount: number; clockwise: boolean }>()
  for (const sp of q('Splitter')) {
    splitterMap.set(text(sp, 'SplitterId')!, {
      bitWidth: num(sp, 'BitWidth', 4) || 4,
      pinCount: num(sp, 'PinCount', 4) || 4,
      clockwise: text(sp, 'Clockwise') !== 'false',
    })
  }

  // Wires
  for (const w of q('Wire')) {
    const lcId = text(w, 'LogicalCircuitId')!
    const circuit = circuitMap.get(lcId)
    if (!circuit) continue
    const x1 = num(w, 'X1'), y1 = num(w, 'Y1'), x2 = num(w, 'X2'), y2 = num(w, 'Y2')
    circuit.diagram.addWire({ x: x1, y: y1 }, { x: x2, y: y2 }, 1)
  }

  // CircuitSymbols
  for (const sym of q('CircuitSymbol')) {
    const lcId = text(sym, 'LogicalCircuitId')!
    const circuit = circuitMap.get(lcId)
    if (!circuit) continue
    const cid = text(sym, 'CircuitId')!
    const x = num(sym, 'X'), y = num(sym, 'Y')
    const rot = (text(sym, 'Rotation') ?? 'Up').toLowerCase()
    const rotation = rot === 'right' ? 'right' : rot === 'down' ? 'down' : rot === 'left' ? 'left' : 'up'

    // subcircuito?
    if (circuits.has(cid) && cid !== mainId) {
      // no placement yet (subcircuit as component) — skip
      continue
    }
    // pin?
    const pin = pinMap.get(cid)
    if (pin) {
      // Pin is a device in our model; but our editor doesn't place pins. Skip for now.
      continue
    }
    // constant? (import of constants deferred — no addConstant on Diagram yet)
    const cst = constantMap.get(cid)
    if (cst) {
      continue
    }
    // splitter?
    const sp = splitterMap.get(cid)
    if (sp) {
      // no addSplitter on diagram (deferred); skip
      continue
    }
    // gate? decode guid
    const gate = decodeGateGuid(cid)
    if (gate) {
      const g = circuit.diagram.addGate(gate.gateType, { x, y }, gate.inputCount, gate.invertedOutput)
      // apply rotation
      if (rotation !== 'up') {
        // rotate by repeated 90
        const order = ['up', 'right', 'down', 'left']
        const from = order.indexOf('up')
        const to = order.indexOf(rotation)
        const steps = (to - from + 4) % 4
        for (let i = 0; i < steps; i++) circuit.diagram.rotate(g.id, true)
      }
    }
  }

  // Open main circuit
  project.openCircuit(mainId && circuitMap.has(mainId) ? mainId : MAIN_CIRCUIT_ID)
  return project
}

export function exportCircuitProject(project: CircuitProject): string {
  // Minimal export: produce a valid-ish XML. Full fidelity (Gate GUIDs, pins, etc.) is future work.
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="utf-8"?>')
  lines.push(`<lc:CircuitProject xmlns:lc="${NS}">`)
  lines.push('  <lc:Project>')
  lines.push(`    <lc:LogicalCircuitId>${project.currentCircuitId}</lc:LogicalCircuitId>`)
  lines.push('  </lc:Project>')
  for (const c of project.circuitsList) {
    lines.push('  <lc:LogicalCircuit>')
    lines.push(`    <lc:LogicalCircuitId>${c.id}</lc:LogicalCircuitId>`)
    lines.push(`    <lc:Name>${escapeXml(c.name)}</lc:Name>`)
    lines.push('  </lc:LogicalCircuit>')
    for (const el of c.elements) {
      if (el.kind === 'wire') {
        lines.push('  <lc:Wire>')
        lines.push(`    <lc:WireId>${el.id}</lc:WireId>`)
        lines.push(`    <lc:LogicalCircuitId>${c.id}</lc:LogicalCircuitId>`)
        lines.push(`    <lc:X1>${el.p1.x}</lc:X1>`)
        lines.push(`    <lc:Y1>${el.p1.y}</lc:Y1>`)
        lines.push(`    <lc:X2>${el.p2.x}</lc:X2>`)
        lines.push(`    <lc:Y2>${el.p2.y}</lc:Y2>`)
        lines.push('  </lc:Wire>')
      }
    }
    for (const el of c.elements) {
      if (el.kind === 'gate') {
        const gateGuid = `00000000-0000-0000-0000-000000${GATE_TYPES.indexOf(el.gateType).toString(16).padStart(2, '0')}${el.inputCount.toString(16).padStart(2, '0')}${el.invertedOutput ? '01' : '00'}`
        lines.push('  <lc:CircuitSymbol>')
        lines.push(`    <lc:CircuitSymbolId>${el.id}</lc:CircuitSymbolId>`)
        lines.push(`    <lc:CircuitId>${gateGuid}</lc:CircuitId>`)
        lines.push(`    <lc:LogicalCircuitId>${c.id}</lc:LogicalCircuitId>`)
        lines.push(`    <lc:X>${el.position.x}</lc:X>`)
        lines.push(`    <lc:Y>${el.position.y}</lc:Y>`)
        lines.push('  </lc:CircuitSymbol>')
      }
    }
  }
  lines.push('</lc:CircuitProject>')
  return lines.join('\n')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}