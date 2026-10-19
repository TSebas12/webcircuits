import { describe, expect, it } from 'vitest'
import { Connection, ConnectionSet } from '../../../../src/core/simulate/connection'
import { SymbolIndex, projectIndex } from '../../../../src/core/model/symbol'
import type { Gate, Project } from '../../../../src/core/model/types'

/**
 * Dos compuertas colocadas en la misma hoja, para tener puntas de verdad (no simulacros):
 * las conexiones se guardan por identidad de punta, así que un objeto inventado no
 * probaría nada.
 */
function twoGates(): { readonly index: SymbolIndex; readonly left: Gate; readonly right: Gate } {
  const left: Gate = {
    kind: 'gate',
    id: 'g-left',
    circuitId: 'main',
    layerId: 'principal',
    position: { x: 0, y: 0 },
    rotation: 'up',
    gateType: 'and',
    inputCount: 2,
    invertedOutput: false,
  }
  const right: Gate = {
    ...left,
    id: 'g-right',
    position: { x: 8, y: 0 },
  }
  const project: Project = {
    id: 'p',
    name: 'P',
    mainCircuitId: 'main',
    circuits: [{ id: 'main', name: 'Main', elements: [left, right] }],
  }

  return { index: projectIndex(project), left, right }
}

function jams(index: SymbolIndex, gate: Gate) {
  return index.symbol(gate).jams
}

describe('conjunto de conexiones (portado de CircuitMap.Connection.cs)', () => {
  it('recordar dos veces el mismo par devuelve la misma conexión', () => {
    // Esto es lo que hace que un lazo termine: la segunda vez que se llega por otro
    // camino, `connect` ya sabe que ese tramo está hecho y no lo vuelve a bajar.
    const { index, left, right } = twoGates()
    const out = jams(index, left)[2]!
    const input = jams(index, right)[0]!

    const set = new ConnectionSet()
    const first = set.connect(input, out)
    const second = set.connect(input, out)

    expect(first).toBe(second)
    expect(first).toBeInstanceOf(Connection)
    expect(first.outJam).toBe(out)
    expect(first.inJam).toBe(input)
  })

  it('una salida recuerda todo lo que cuelga de ella', () => {
    const { index, left, right } = twoGates()
    const out = jams(index, left)[2]!
    const set = new ConnectionSet()

    set.connect(jams(index, right)[0]!, out)
    set.connect(jams(index, right)[1]!, out)
    set.connect(jams(index, left)[0]!, out)

    expect(set.selectByOutput(out)).toHaveLength(3)
    expect(set.selectByOutput(jams(index, left)[0]!)).toEqual([])
  })

  it('las conexiones se recuerdan por sentido: salida → entradas', () => {
    const { index, left, right } = twoGates()
    const out = jams(index, left)[2]!
    const input = jams(index, right)[0]!
    const set = new ConnectionSet()

    set.connect(input, out)

    // Al revés no hay nada: a una entrada no le cuelga nada.
    expect(set.selectByOutput(input)).toEqual([])
    expect(set.all()).toHaveLength(1)
  })

  it('los circuitos se marcan una sola vez, y no se desmarca', () => {
    // La cuenta es por circuito, no por colocación: dos colocaciones del mismo
    // subcircuito comparten las mismas puntas, así que sus cables se resuelven una vez.
    const set = new ConnectionSet()

    expect(set.isConnected('lc')).toBe(false)
    set.markConnected('lc')
    expect(set.isConnected('lc')).toBe(true)
  })
})
