import { describe, expect, it } from 'vitest'
import { MAX_BIT_WIDTH } from '../../../../src/core/model/types'
import type { Circuit, GridPoint, Project, Signal, Wire } from '../../../../src/core/model/types'

describe('constantes del modelo', () => {
  it('el ancho máximo de cable coincide con el original (BasePin.MaxBitWidth = 32)', () => {
    // Guardián: JavaScript hace las operaciones de bits a 32 bits. Si alguien sube este
    // número por encima de 32, las señales dejarían de caber en un número y la
    // simulación mentiría en silencio.
    expect(MAX_BIT_WIDTH).toBe(32)
  })
})

describe('formas del modelo', () => {
  it('un cable guarda sus dos extremos en unidades de rejilla', () => {
    const p1: GridPoint = { x: 2, y: 3 }
    const p2: GridPoint = { x: 2, y: 9 }
    const wire: Wire = { kind: 'wire', id: 'w1', circuitId: 'c1', p1, p2, bitWidth: 1 }

    expect(wire.p2.y - wire.p1.y).toBe(6)
    expect(wire.bitWidth).toBe(1)
  })

  it('una señal es una máscara de bits: cabe un bus de 32 bits', () => {
    const allOnes: Signal = 0xffffffff

    // El literal es un entero positivo corriente…
    expect(allOnes).toBe(4_294_967_295)
    // …y solo se ve con signo al pasar por un operador de bits.
    // Esto obliga a una decisión de diseño en la simulación (M2): elegir UNA forma de
    // representar las señales (con signo o sin signo) y no mezclarlas nunca.
    expect(allOnes | 0).toBe(-1)

    expect(allOnes & 1).toBe(1)
    expect(allOnes >>> (MAX_BIT_WIDTH - 1)).toBe(1) // el bit 31 también viaja
  })

  it('el desplazamiento de 32 bits da la vuelta (¡trampa al portar la simulación!)', () => {
    // Guardián de una trampa real: en JavaScript los operadores de bits trabajan a 32
    // bits y el desplazamiento usa el contador módulo 32. Portar `1u << 32` de C# o
    // construir una máscara con `<<` daría resultados silenciosamente falsos.
    expect(1 << MAX_BIT_WIDTH).toBe(1)
    expect(1 << (MAX_BIT_WIDTH - 1)).toBe(-2_147_483_648)
  })

  it('un proyecto cuelga de un circuito principal', () => {
    const leaf: Circuit = { id: 'c1', name: 'Main', elements: [] }
    const project: Project = {
      id: 'p1',
      name: 'Prueba',
      circuits: [leaf],
      mainCircuitId: 'c1',
    }

    expect(project.circuits.map((circuit) => circuit.id)).toContain(project.mainCircuitId)
  })
})
