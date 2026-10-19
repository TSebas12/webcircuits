import { describe, expect, it } from 'vitest'
import { CircuitMap } from '../../../../src/core/simulate/circuit-map'
import { projectIndex } from '../../../../src/core/model/symbol'
import { CircuitError } from '../../../../src/core/circuit-error'
import type {
  Circuit,
  CircuitInstance,
  Gate,
  Pin,
  Project,
  StoredElement,
  Wire,
} from '../../../../src/core/model/types'

function gate(
  id: string,
  circuitId: string,
  position: { x: number; y: number },
  gateType: Gate['gateType'] = 'and',
): Gate {
  return {
    kind: 'gate',
    id,
    circuitId,
    layerId: 'principal',
    position,
    rotation: 'up',
    gateType,
    inputCount: 2,
    invertedOutput: false,
  }
}

function sheetPin(
  id: string,
  circuitId: string,
  pinType: 'input' | 'output',
  position: { x: number; y: number },
  name: string,
): Pin {
  return {
    kind: 'pin',
    id,
    circuitId,
    layerId: 'principal',
    position,
    rotation: 'up',
    pinType,
    side: pinType === 'input' ? 'left' : 'right',
    bitWidth: 1,
    inverted: false,
    name,
  }
}

function wire(id: string, circuitId: string, x1: number, y1: number, x2: number, y2: number): Wire {
  return {
    kind: 'wire',
    id,
    circuitId,
    layerId: 'principal',
    p1: { x: x1, y: y1 },
    p2: { x: x2, y: y2 },
    bitWidth: 1,
  }
}

function instance(
  id: string,
  circuitId: string,
  targetCircuitId: string,
  position: { x: number; y: number },
): CircuitInstance {
  return {
    kind: 'circuit',
    id,
    circuitId,
    layerId: 'principal',
    position,
    rotation: 'up',
    targetCircuitId,
  }
}

function circuit(id: string, name: string, elements: readonly StoredElement[]): Circuit {
  return { id, name, elements }
}

function project(...circuits: readonly Circuit[]): Project {
  return { id: 'p', name: 'P', mainCircuitId: 'main', circuits }
}

/**
 * Una hoja con dos compuertas AND: la primera alimenta la primera entrada de la segunda con
 * un cable suelto entre sus puntas.
 *
 * La AND de dos entradas mide 3×4, así que colocada en (0, 0) tiene sus entradas en (0, 1) y
 * (0, 3) y su salida en (3, 2); en (8, 0) las tiene en (8, 1) y (8, 3).
 */
function twoGates(): Circuit {
  return circuit('main', 'Main', [
    gate('g1', 'main', { x: 0, y: 0 }),
    gate('g2', 'main', { x: 8, y: 0 }),
    wire('w1', 'main', 3, 2, 8, 1),
  ])
}

/**
 * Un subcircuito con un pin de entrada, una compuerta realimentada consigo misma y un pin de
 * salida; y una hoja principal que lo coloca y le lleva una señal desde fuera.
 *
 * Es el caso que prueba que un subcircuito se simula **por dentro**: la compuerta de dentro
 * acaba con un parámetro que apunta al resultado de la compuerta de fuera, aunque las dos
 * estén en hojas distintas y el cable pase por un pin. La realimentación no es un adorno:
 * sin ella la compuerta no tendría ningún consumidor y el aplanado la tiraría (ver la prueba
 * del recorte), que es justo lo que hace el original con la lógica que no llega a ningún
 * sitio.
 */
function nested(): Project {
  const child = circuit('lc', 'Dentro', [
    sheetPin('pin-x', 'lc', 'input', { x: 2, y: 2 }, 'x'),
    gate('g', 'lc', { x: 8, y: 0 }),
    sheetPin('pin-q', 'lc', 'output', { x: 18, y: 2 }, 'q'),
    wire('w-x', 'lc', 4, 3, 8, 1),
    wire('w-loop', 'lc', 11, 2, 8, 3),
    wire('w-q', 'lc', 11, 2, 18, 3),
  ])
  const main = circuit('main', 'Main', [
    gate('src', 'main', { x: 0, y: 0 }),
    instance('i1', 'main', 'lc', { x: 8, y: 6 }),
    wire('w-in', 'main', 3, 2, 8, 8),
  ])
  return project(main, child)
}

/** Una compuerta que se alimenta a sí misma: la salida vuelve a su primera entrada. */
function selfLoop(): Circuit {
  return circuit('main', 'Main', [
    gate('g1', 'main', { x: 0, y: 0 }),
    wire('w1', 'main', 3, 2, 0, 1),
  ])
}

describe('mapa de simulación (portado de CircuitMap.cs)', () => {
  it('un circuito que se contiene a sí mismo se rechaza al bajar por el árbol', () => {
    // Ni siquiera hace falta que el lazo sea directo: basta con que un circuito esté en su
    // propia rama de arriba, porque al simularlo se bajaría para siempre.
    const self = circuit('self', 'Bucle', [instance('i1', 'self', 'self', { x: 0, y: 0 })])
    const index = projectIndex(project(self))

    expect(() => CircuitMap.create(index, self)).toThrow(CircuitError)
    expect(() => CircuitMap.create(index, self)).toThrow(/se contiene a sí mismo/)
  })

  it('el árbol guarda los hijos y sabe dónde está cada uno', () => {
    const index = projectIndex(nested())
    const root = CircuitMap.create(index, index.circuit('main')!)

    expect(root.isRoot).toBe(true)
    expect(root.path()).toBe('/Main')
    expect(root.children).toHaveLength(1)

    const child = root.children[0]!
    expect(child.isRoot).toBe(false)
    expect(child.circuit.name).toBe('Dentro')
    expect(child.path()).toBe('/Main/Dentro(8,6)')
    expect(child.root).toBe(root)
    expect(child.children).toEqual([])
  })

  it('conecta la salida de una compuerta con las entradas que le caen en el cable', () => {
    const index = projectIndex(project(twoGates()))
    const root = CircuitMap.create(index, index.circuit('main')!)

    const outJam = index.symbol(index.element('g1')!).jams[2]!
    const inJam = index.symbol(index.element('g2')!).jams[0]!
    const connections = root.connectionSet().selectByOutput(outJam)

    expect(connections).toHaveLength(1)
    expect(connections[0]!.inJam).toBe(inJam)
    expect(connections[0]!.outJam).toBe(outJam)
  })

  it('un cable solo alcanza las entradas que toca, no todas', () => {
    // El cable va de la salida de g1 (3, 2) a la **primera** entrada de g2 (8, 1). La
    // segunda entrada de g2 (8, 3) está en otro conductor y no la toca nadie.
    const index = projectIndex(project(twoGates()))
    const root = CircuitMap.create(index, index.circuit('main')!)

    const connections = root
      .connectionSet()
      .selectByOutput(index.symbol(index.element('g1')!).jams[2]!)

    expect(connections.map((connection) => connection.inJam.point)).toEqual([{ x: 8, y: 1 }])
  })

  it('una compuerta de dentro de un subcircuito lee de la compuerta de fuera', () => {
    // El recorrido cruza tres sitios: el cable de la hoja principal, el pin de hoja y el
    // cable de dentro. Que la compuerta de dentro acabe con un parámetro es la prueba de
    // que el aplanado siguió el camino entero.
    const index = projectIndex(nested())
    const state = CircuitMap.create(index, index.circuit('main')!).apply(0)

    expect(state.functions).toHaveLength(1)
    // Sus dos entradas están conectadas: una viene de la compuerta de fuera (índice 3) y la
    // otra de sí misma (índice 4).
    expect(state.functions[0]!.reportName).toBe('AND(2)')
    expect(state.functions[0]!.parameters).toEqual([3, 4])
  })

  it('los índices de estado se reparten al aplanar, no antes', () => {
    // La de fuera va primero (es la primera de la lista), luego la de dentro. Los índices
    // 1..3 son del propio `CircuitState` (original: `new CircuitState(3)`), así que el
    // primer resultado se queda con el 3 y el segundo con el 4.
    const index = projectIndex(nested())
    const state = CircuitMap.create(index, index.circuit('main')!).apply(0)

    expect(state.count).toBe(5)
  })

  it('pide los índices de estado de un cable mirando quién toca sus puntas', () => {
    const index = projectIndex(nested())
    const root = CircuitMap.create(index, index.circuit('main')!)
    root.apply(0)

    // El cable toca la salida de la compuerta de fuera, que se quedó con el índice 3.
    expect(root.stateIndexes(wire('probe', 'main', 3, 2, 8, 8))).toEqual([3])
  })

  it('una compuerta realimentada se evalúa con su propio resultado', () => {
    // El lazo se cierra sobre sí mismo. El recorrido no se muerde la cola porque lleva la
    // cuenta de los pares (punta, bit) ya visitados, y el ordenador acaba leyendo el bit que
    // él mismo escribe: es un lazo real, no un error.
    const index = projectIndex(project(selfLoop()))
    const state = CircuitMap.create(index, index.circuit('main')!).apply(0)

    expect(state.count).toBe(4)
    expect(state.functions).toHaveLength(1)
    expect(state.functions[0]!.parameters).toEqual([3])
  })

  it('una compuerta sin entradas conectadas no llega a tener función', () => {
    // Se descarta al limpiar (no la lee nadie) y, aunque no se descartara, no habría de
    // dónde leer: `DefineGate` no crea función si no hay ningún parámetro con índice.
    const lonely = circuit('main', 'Main', [gate('g1', 'main', { x: 0, y: 0 })])
    const index = projectIndex(project(lonely))
    const state = CircuitMap.create(index, index.circuit('main')!).apply(0)

    expect(state.functions).toHaveLength(0)
  })

  it('el recorte se lleva por delante lo que solo alimentaba a lo descartado', () => {
    // g2 lee de g1, pero la salida de g2 no llega a ninguna parte. Primero cae g2 (nadie
    // consume su salida) y, al caer, su parámetro desaparece del resultado de g1, que se
    // queda sin consumidor y cae en la vuelta siguiente.
    const chain = circuit('main', 'Main', [
      gate('g1', 'main', { x: 0, y: 0 }),
      gate('g2', 'main', { x: 8, y: 0 }),
      wire('w1', 'main', 3, 2, 8, 1),
    ])
    const index = projectIndex(project(chain))
    const state = CircuitMap.create(index, index.circuit('main')!).apply(0)

    expect(state.count).toBe(3)
    expect(state.functions).toHaveLength(0)
  })

  it('una hoja de subcircuito se puede simular sola, con sus pines sueltos', () => {
    // Visto desde dentro, la compuerta de dentro lee de su propia realimentación; el pin de
    // entrada, al no estar conectado a nada por fuera, no aporta nada.
    const index = projectIndex(nested())
    const state = CircuitMap.create(index, index.circuit('lc')!).apply(0)

    expect(state.functions).toHaveLength(1)
  })

  it('lo que todavía no sabe simularse avisa en vez de simular mal', () => {
    // El interruptor existe en el modelo pero su función llega con M2-04/M2-12; hasta
    // entonces el mapa no lo puede convertir en función.
    const withButton = circuit('main', 'Main', [
      {
        kind: 'button',
        id: 'b1',
        circuitId: 'main',
        layerId: 'principal',
        position: { x: 0, y: 0 },
        rotation: 'up',
        isToggle: true,
        inverted: false,
      },
      gate('g2', 'main', { x: 8, y: 0 }),
      wire('w1', 'main', 2, 1, 8, 1),
      wire('w2', 'main', 11, 2, 8, 3),
    ])
    const index = projectIndex(project(withButton))

    expect(() => CircuitMap.create(index, index.circuit('main')!).apply(0)).toThrow(
      /todavía no está portada/,
    )
  })

  it('dos puntas de distinto ancho no se pueden juntar', () => {
    // El original lo perdona solo cuando la punta que recibe es una probeta, que se conecta
    // a cualquier ancho porque solo mira. Las probetas llegan en M2-12; mientras tanto,
    // juntar un cable de 1 bit con uno de 2 es un error del circuito.
    const mismatched = circuit('main', 'Main', [
      gate('g1', 'main', { x: 0, y: 0 }),
      { ...sheetPin('pin-wide', 'main', 'input', { x: 2, y: 2 }, 'ancho'), bitWidth: 2 },
      wire('w1', 'main', 3, 2, 4, 3),
    ])
    const index = projectIndex(project(mismatched))
    const root = CircuitMap.create(index, index.circuit('main')!)

    expect(() => root.connectionSet()).toThrow(/dos anchos distintos/)
  })
})
