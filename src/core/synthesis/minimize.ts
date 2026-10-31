/**
 * Minimización de funciones booleanas (M8B-02).
 *
 * Implementa Quine–McCluskey para funciones de hasta 20 variables (aunque la UI
 * del hito lo limitará a 6 para Karnaugh). Devuelve los implicantes primos, los
 * esenciales y una cubierta mínima, más la expresión en suma de productos.
 */

import type { BooleanFunction } from './function'

/** Un implicante: unos bits fijos (care=1) con un valor, y el resto «don't care». */
export interface Implicant {
  /** Máscara de bits fijos: 1 = bit fijo, 0 = don't care. */
  readonly care: number
  /** Valores de los bits fijos (los don't care valen 0). */
  readonly value: number
}

export interface MinimizedFunction {
  readonly inputCount: number
  readonly inputNames: readonly string[]
  readonly outputName: string | null
  /** Todos los implicantes primos. */
  readonly primeImplicants: readonly Implicant[]
  /** Implicantes primos esenciales. */
  readonly essentialPrimeImplicants: readonly Implicant[]
  /** Cubierta mínima elegida. */
  readonly implicants: readonly Implicant[]
  /** Expresión en suma de productos (0 / 1 si es constante). */
  readonly expression: string
}

function serializeImplicant(im: Implicant): string {
  return `${im.care.toString(16)}:${im.value.toString(16)}`
}

function combine(a: Implicant, b: Implicant): Implicant | null {
  if (a.care !== b.care) return null
  const diff = a.value ^ b.value
  if (diff === 0) return null
  if ((diff & (diff - 1)) !== 0) return null
  if ((a.care & diff) !== diff) return null
  return { care: a.care & ~diff, value: a.value & ~(diff) }
}

/** Convierte un implicante a producto de literales. */
export function implicantToProduct(
  im: Implicant,
  inputCount: number,
  names?: readonly string[],
): string {
  const vars =
    names && names.length === inputCount
      ? names
      : Array.from({ length: inputCount }, (_, i) => String.fromCharCode(65 + i))
  const literals: string[] = []
  let mask = 1 << (inputCount - 1)
  for (let i = 0; i < inputCount; i += 1) {
const variable = vars[i] ?? ''
      if (im.care & mask) {
        literals.push((im.value & mask) !== 0 ? variable : `${variable}'`)
      }
    mask >>>= 1
  }
  if (literals.length === 0) return '1'
  return literals.join('')
}

function covers(im: Implicant, minterm: number): boolean {
  return (minterm & im.care) === (im.value & im.care)
}

export function minimize(fn: BooleanFunction): MinimizedFunction {
  const inputCount = fn.inputCount
  const total = 1 << inputCount
  const minterms = new Set<number>(fn.minterms)
  const dontCares = new Set<number>(fn.dontCares)

  if (minterms.size === 0) {
    return {
      inputCount,
      inputNames: fn.inputNames,
      outputName: fn.outputName,
      primeImplicants: [],
      essentialPrimeImplicants: [],
      implicants: [],
      expression: '0',
    }
  }
  if (minterms.size + dontCares.size === total) {
    return {
      inputCount,
      inputNames: fn.inputNames,
      outputName: fn.outputName,
      primeImplicants: [{ care: 0, value: 0 }],
      essentialPrimeImplicants: [{ care: 0, value: 0 }],
      implicants: [{ care: 0, value: 0 }],
      expression: '1',
    }
  }

  // 1) Generar implicantes primos con Quine–McCluskey.
  let terms: Implicant[] = [...minterms, ...dontCares].map((m) => ({
    care: total - 1,
    value: m,
  }))

  const primeSet = new Set<string>()
  const primeList: Implicant[] = []

  let changed = true
  while (changed) {
    changed = false
    const used = new Set<number>()
    const next: Implicant[] = []
    for (let i = 0; i < terms.length; i += 1) {
      for (let j = i + 1; j < terms.length; j += 1) {
        const r = combine(terms[i] as Implicant, terms[j] as Implicant)
        if (r !== null) {
          used.add(i)
          used.add(j)
          next.push(r)
          changed = true
        }
      }
    }
    for (let i = 0; i < terms.length; i += 1) {
      if (!used.has(i)) {
        const key = serializeImplicant(terms[i] as Implicant)
        if (!primeSet.has(key)) {
          primeSet.add(key)
          primeList.push(terms[i] as Implicant)
        }
      }
    }
    // Deduplicar el siguiente nivel.
    const seen = new Set<string>()
    terms = []
    for (const im of next) {
      const key = serializeImplicant(im)
      if (!seen.has(key)) {
        seen.add(key)
        terms.push(im)
      }
    }
  }

  // Primos que cubren al menos un minterm (los que solo cubren don't cares no sirven).
  const usefulPrimes = primeList.filter((im) =>
    [...minterms].some((m) => covers(im, m)),
  )

  // 2) Implicantes esenciales.
  const essential: Implicant[] = []
  for (const m of minterms) {
    const covering = usefulPrimes.filter((im) => covers(im, m))
    if (covering.length === 1) {
      const only = covering[0] as Implicant
      if (!essential.some((e) => serializeImplicant(e) === serializeImplicant(only))) {
        essential.push(only)
      }
    }
  }

  const coveredByEssential = new Set<number>()
  for (const im of essential) {
    for (const m of minterms) {
      if (covers(im, m)) coveredByEssential.add(m)
    }
  }

  const remainingMinterms = [...minterms].filter((m) => !coveredByEssential.has(m))

  // 3) Cubierta exacta mínima del resto (ramificación).
  const uncovered0 = new Set<number>(remainingMinterms)
  let best: Implicant[] | null = essential.length > 0 ? [...essential] : []

  // backtracking
  const candidates = usefulPrimes.filter(
    (im) => !essential.some((e) => serializeImplicant(e) === serializeImplicant(im)),
  )

  function search(chosen: Implicant[], remaining: Set<number>) {
    if (remaining.size === 0) {
      const full = [...essential, ...chosen]
      if (best === null || full.length < best.length) best = full
      return
    }
    // elegir el minterm con menos candidatos
    let target: number | null = null
    let opts: Implicant[] = []
    for (const m of remaining) {
      const cs = candidates.filter(
        (im) => !chosen.some((c) => serializeImplicant(c) === serializeImplicant(im)) && covers(im, m),
      )
      if (target === null || cs.length < opts.length) {
        target = m
        opts = cs
        if (cs.length <= 1) break
      }
    }
    if (target === null || opts.length === 0) return
    for (const im of opts) {
      const newRemaining = new Set<number>(remaining)
      for (const m of minterms) {
        if (covers(im, m)) newRemaining.delete(m)
      }
      const newChosen = [...chosen, im]
      // poda por tamaño
      if (best !== null && newChosen.length + essential.length >= best.length) continue
      search(newChosen, newRemaining)
    }
  }

  if (remainingMinterms.length > 0) {
    search([], uncovered0)
  }
  if (best === null) best = [...essential]

  const expression =
    best.length === 0
      ? '0'
      : best.map((im) => implicantToProduct(im, inputCount, fn.inputNames)).join(' + ')

  return {
    inputCount,
    inputNames: fn.inputNames,
    outputName: fn.outputName,
    primeImplicants: usefulPrimes,
    essentialPrimeImplicants: essential,
    implicants: best,
    expression,
  }
}