import { describe, expect, it } from 'vitest'
import {
  COMPONENT_FORMAT_NAME,
  COMPONENT_FORMAT_VERSION,
  ComponentFormatError,
  createComponentDocument,
  parseComponent,
  serializeComponent,
  validateComponent,
} from '../../../../src/core/persist/component-format'
import type { SerializedCircuit } from '../../../../src/core/persist/json'

function circuit(id: string, name: string): SerializedCircuit {
  return {
    id,
    name,
    elements: [
      {
        kind: 'wire',
        id: `${id}-w1`,
        circuitId: id,
        layerId: 'principal',
        p1: { x: 0, y: 0 },
        p2: { x: 4, y: 0 },
        bitWidth: 1,
      },
    ],
    layers: [
      { id: 'principal', name: 'Principal', color: '#888888', opacity: 1, visible: true, locked: false },
    ],
  }
}

function input(): Parameters<typeof createComponentDocument>[0] {
  return {
    metadata: {
      name: 'Sumador de 4 bits',
      description: 'Cuatro semisumadores encadenados',
      author: 'WebCircuits',
      createdAt: '2026-10-22T00:00:00.000Z',
      tags: ['suma', 'aritmética'],
    },
    rootCircuitId: 'adder',
    circuits: [circuit('adder', 'Sumador')],
  }
}

describe('formato de componente .wccomp (M4C-01)', () => {
  it('crea la cabecera, la valida y la vuelve a leer igual', () => {
    const created = createComponentDocument(input())
    expect(created.format).toBe(COMPONENT_FORMAT_NAME)
    expect(created.version).toBe(COMPONENT_FORMAT_VERSION)
    expect(created.kind).toBe('component')
    expect(created.rootCircuitId).toBe('adder')

    const loaded = parseComponent(serializeComponent(created))
    expect(loaded).toEqual(created)
  })

  it('conserva las capas y los campos opcionales del circuito', () => {
    const base = input()
    const withExtras = createComponentDocument({
      ...base,
      circuits: [
        {
          ...circuit('adder', 'Sumador'),
          busGroups: [
            {
              id: 'bus-1',
              kind: 'busGroup',
              circuitId: 'adder',
              layerId: 'principal',
              wireIds: ['adder-w1'],
              collapsed: true,
              name: 'Datos',
            },
          ],
        },
      ],
    })

    const loaded = parseComponent(serializeComponent(withExtras))
    expect(loaded.circuits[0]?.busGroups).toHaveLength(1)
    expect(loaded.circuits[0]?.layers).toHaveLength(1)
  })

  it('rellena con vacío los metadatos que no son obligatorios', () => {
    const loaded = validateComponent({
      format: COMPONENT_FORMAT_NAME,
      version: 1,
      kind: 'component',
      metadata: { name: 'Solo nombre' },
      rootCircuitId: 'adder',
      circuits: [circuit('adder', 'Sumador')],
    })
    expect(loaded.metadata).toEqual({
      name: 'Solo nombre',
      description: '',
      author: '',
      createdAt: '',
      tags: [],
    })
  })

  it('rechaza JSON roto antes de devolver un componente a medias', () => {
    expect(() => parseComponent('{')).toThrowError(ComponentFormatError)
    try {
      parseComponent('{')
    } catch (error) {
      expect(error).toMatchObject({ code: 'json' })
    }
  })

  it('rechaza otro formato, otra versión y documentos que no son componentes', () => {
    const base = input()
    expect(() =>
      validateComponent({
        format: 'webcircuits',
        version: 1,
        kind: 'component',
        metadata: base.metadata,
        rootCircuitId: 'adder',
        circuits: base.circuits,
      }),
    ).toThrowError(/Formato desconocido/)

    expect(() =>
      validateComponent({
        format: COMPONENT_FORMAT_NAME,
        version: COMPONENT_FORMAT_VERSION + 1,
        kind: 'component',
        metadata: base.metadata,
        rootCircuitId: 'adder',
        circuits: base.circuits,
      }),
    ).toThrowError(/Versión no soportada/)

    expect(() =>
      validateComponent({
        format: COMPONENT_FORMAT_NAME,
        version: 1,
        kind: 'project',
        metadata: base.metadata,
        rootCircuitId: 'adder',
        circuits: base.circuits,
      }),
    ).toThrowError(/no es un componente/)
  })

  it('no acepta circuitos sin id, repetidos o sin el raíz', () => {
    const base = input()
    const withDuplicate = createComponentDocument(base).circuits

    expect(() =>
      validateComponent({
        ...createComponentDocument(base),
        circuits: [withDuplicate[0], withDuplicate[0]],
      }),
    ).toThrowError(/aparece más de una vez/)

    expect(() =>
      validateComponent({
        ...createComponentDocument(base),
        rootCircuitId: 'no-existe',
      }),
    ).toThrowError(/no está en el componente/)

    expect(() =>
      validateComponent({
        ...createComponentDocument(base),
        circuits: [{ id: 'adder', name: 'Sin elementos' }],
      }),
    ).toThrowError(/lista de elementos/)
  })

  it('exige un nombre de componente y que los metadatos sean un objeto', () => {
    const base = createComponentDocument(input())
    expect(() =>
      validateComponent({ ...base, metadata: { ...base.metadata, name: '' } }),
    ).toThrowError(/metadata\.name/)
    expect(() => validateComponent({ ...base, metadata: null })).toThrowError(
      /metadatos del componente/,
    )
  })
})
