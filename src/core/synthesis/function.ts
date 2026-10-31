/**
 * Representación de una función lógica booleana (M8B-01).
 *
 * Una función se describe por su tabla de verdad (un bit por cada combinación de
 * entradas) y, de ahí, por la lista de **minterms** (combinaciones en las que vale
 * 1) y de **maxterms** (combinaciones en las que vale 0). Las dos listas son
 * complementarias: `minterms ∪ maxterms = {0, …, 2^inputCount − 1}`.
 *
 * Es la entrada del resto del hito M8B: primero se minimiza (M8B-02), luego se
 * sintetiza a una red de compuertas (M8B-03). La representación es deliberadamente
 * pura y sin dependencias del navegador: un número por cada fila, como los índices
 * de la tabla de verdad.
 */

/** Nombre de cada variable de entrada, en el orden de sus bits (más significativo primero). */
export interface BooleanFunction {
  /** Número de variables de entrada. */
  readonly inputCount: number
  /** Nombres de las entradas, en el mismo orden que los bits de un minterm. */
  readonly inputNames: readonly string[]
  /** Nombre de la salida que esta función representa (opcional). */
  readonly outputName: string | null
  /** Índices de fila cuyo valor de salida es 1. */
  readonly minterms: readonly number[]
  /** Índices de fila cuyo valor de salida es 0. */
  readonly maxterms: readonly number[]
  /** Índices de fila cuyo valor es irrelevante (don't care). Vacío por defecto. */
  readonly dontCares: readonly number[]
}

/** Cuenta de combinaciones para `inputCount` variables. */
export function combinationCount(inputCount: number): number {
  if (!Number.isInteger(inputCount) || inputCount < 0 || inputCount > 20) {
    throw new RangeError('inputCount debe ser un entero entre 0 y 20')
  }
  return 1 << inputCount
}

/**
 * Construye una función a partir de los valores de salida, uno por cada fila de la
 * tabla de verdad en orden natural (0 … 2^n − 1). Un valor distinto de 0 se toma
 * como 1 lógico; `null`/`undefined` se interpretan como "don't care".
 */
export function booleanFunction(
  inputCount: number,
  outputs: readonly (0 | 1 | boolean | null | undefined)[],
  inputNames?: readonly string[],
  outputName?: string | null,
): BooleanFunction {
  const total = combinationCount(inputCount)
  if (outputs.length !== total) {
    throw new RangeError(`esperaba ${total} salidas, recibió ${outputs.length}`)
  }
  const names =
    inputNames && inputNames.length === inputCount
      ? inputNames
      : Array.from({ length: inputCount }, (_, i) => `x${i + 1}`)

  const minterms: number[] = []
  const maxterms: number[] = []
  const dontCares: number[] = []
  for (let i = 0; i < total; i += 1) {
    const v = outputs[i]
    if (v === null || v === undefined) {
      dontCares.push(i)
    } else if (v === true || v === 1) {
      minterms.push(i)
    } else {
      maxterms.push(i)
    }
  }
  return {
    inputCount,
    inputNames: names,
    outputName: outputName === undefined ? null : outputName,
    minterms,
    maxterms,
    dontCares,
  }
}

/** Indica si el índice dado es un minterm de la función. */
export function isMinterm(fn: BooleanFunction, index: number): boolean {
  return fn.minterms.includes(index)
}

/** Indica si la función es idénticamente 0 (tautología negativa). */
export function isConstantZero(fn: BooleanFunction): boolean {
  return fn.minterms.length === 0
}

/** Indica si la función es idénticamente 1 (tautología). */
export function isConstantOne(fn: BooleanFunction): boolean {
  return fn.maxterms.length === 0 && fn.dontCares.length === 0
}

/**
 * Representa un minterm como producto de literales (más significativo primero).
 * Un bit 1 produce la variable sin negar; un 0, negada. Devuelve una cadena legible.
 */
export function mintermExpression(minterm: number, inputCount: number, names?: readonly string[]): string {
  const vars =
    names && names.length === inputCount
      ? names
      : Array.from({ length: inputCount }, (_, i) => String.fromCharCode(65 + i))
  const value = minterm.toString(2).padStart(inputCount, '0')
  const literals: string[] = []
  for (let i = 0; i < inputCount; i += 1) {
    const variable = vars[i] ?? ''
    literals.push(value[i] === '1' ? variable : `${variable}'`)
  }
  return literals.join('')
}

/** Suma de productos: OR de los minterms como cadena legible. */
export function sumOfProducts(fn: BooleanFunction): string {
  if (fn.minterms.length === 0) return '0'
  return fn.minterms.map((m) => mintermExpression(m, fn.inputCount, fn.inputNames)).join(' + ')
}

/** Suma de maxterms: AND de los maxterms complementados. */
export function productOfMaxterms(fn: BooleanFunction): string {
  if (fn.maxterms.length === 0) return '1'
  return fn.maxterms
    .map((m) => `(${mintermExpression(m, fn.inputCount, fn.inputNames)})'`)
    .join(' · ')
}