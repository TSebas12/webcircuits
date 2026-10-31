/**
 * Síntesis de una red de compuertas a partir de una función minimizada (M8B-03).
 *
 * Produce un netlist plano (nodos + conexiones) que la UI podrá materializar como
 * compuertas en el lienzo. Se soporta la forma estándar (AND/OR/NOT). La opción
 * de usar solo NAND o solo NOR se deja como parámetro para M8B-03b; por ahora
 * las redes se expresan con compuertas básicas.
 */

import type { BooleanFunction } from './function'
import type { MinimizedFunction } from './minimize'
import { minimize } from './minimize'

export type NetlistGateKind = 'input' | 'output' | 'const' | 'not' | 'and' | 'or'

export interface NetlistNode {
  readonly id: string
  readonly kind: NetlistGateKind
  readonly inputs: readonly string[]
  /** Valor para nodos `const`. */
  readonly value?: 0 | 1
}

export interface Netlist {
  readonly inputCount: number
  readonly inputNames: readonly string[]
  readonly outputName: string
  readonly nodes: readonly NetlistNode[]
  readonly outputNodeId: string
}

export type SynthesisMode = 'standard' | 'nand-only' | 'nor-only'

export interface SynthesizeOptions {
  readonly mode?: SynthesisMode
}

function literalNodes(
  im: { care: number; value: number },
  inputCount: number,
  productPrefix: string,
  nodes: NetlistNode[],
): string[] {
  const literals: string[] = []
  let mask = 1 << (inputCount - 1)
  for (let i = 0; i < inputCount; i += 1) {
    if (im.care & mask) {
      const positive = (im.value & mask) !== 0
      if (positive) {
        literals.push(`in${i}`)
      } else {
        const notId = `${productPrefix}_not${i}`
        nodes.push({ id: notId, kind: 'not', inputs: [`in${i}`] })
        literals.push(notId)
      }
    }
    mask >>>= 1
  }
  return literals
}

export function synthesizeNetlist(
  fn: BooleanFunction,
  minimized?: MinimizedFunction,
  options?: SynthesizeOptions,
): Netlist {
  const mode = options?.mode ?? 'standard'
  if (mode !== 'standard') {
    // Reservado para una futura transformación a NAND/NOR puro.
    throw new Error(`modo de síntesis no implementado todavía: ${mode}`)
  }

  const mf = minimized ?? minimize(fn)
  const inputCount = fn.inputCount
  const nodes: NetlistNode[] = []

  for (let i = 0; i < inputCount; i += 1) {
    nodes.push({ id: `in${i}`, kind: 'input', inputs: [] })
  }

  const minterms = fn.minterms

  // Casos constantes.
  if (minterms.length === 0) {
    nodes.push({ id: 'out', kind: 'const', inputs: [], value: 0 })
    return {
      inputCount,
      inputNames: fn.inputNames,
      outputName: fn.outputName ?? 'out',
      nodes,
      outputNodeId: 'out',
    }
  }
  if (minterms.length + fn.dontCares.length === (1 << inputCount)) {
    nodes.push({ id: 'out', kind: 'const', inputs: [], value: 1 })
    return {
      inputCount,
      inputNames: fn.inputNames,
      outputName: fn.outputName ?? 'out',
      nodes,
      outputNodeId: 'out',
    }
  }

  const productNodeIds: string[] = []
  mf.implicants.forEach((im, p) => {
    const prefix = `p${p}`
    const literals = literalNodes(im, inputCount, prefix, nodes)
    if (literals.length === 0) {
      // implicante que cubre todo → constante 1
      const constId = `${prefix}_const`
      nodes.push({ id: constId, kind: 'const', inputs: [], value: 1 })
      productNodeIds.push(constId)
      return
    }
    if (literals.length === 1) {
      productNodeIds.push(literals[0] as string)
      return
    }
    const andId = `${prefix}_and`
    nodes.push({ id: andId, kind: 'and', inputs: literals })
    productNodeIds.push(andId)
  })

  if (productNodeIds.length === 0) {
    nodes.push({ id: 'out', kind: 'const', inputs: [], value: 0 })
    return {
      inputCount,
      inputNames: fn.inputNames,
      outputName: fn.outputName ?? 'out',
      nodes,
      outputNodeId: 'out',
    }
  }
  if (productNodeIds.length === 1) {
    nodes.push({ id: 'out', kind: 'or', inputs: [productNodeIds[0] as string] })
    return {
      inputCount,
      inputNames: fn.inputNames,
      outputName: fn.outputName ?? 'out',
      nodes,
      outputNodeId: 'out',
    }
  }

  nodes.push({ id: 'out', kind: 'or', inputs: productNodeIds })
  return {
    inputCount,
    inputNames: fn.inputNames,
    outputName: fn.outputName ?? 'out',
    nodes,
    outputNodeId: 'out',
  }
}