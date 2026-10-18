import { describe, expect, it } from 'vitest'
import {
  ExpressionParser,
  type ExpressionPins,
  type ExpressionState,
} from '../../../src/core/expression-parser'

/**
 * Port de `Sources/LogicCircuit.UnitTest/ExpressionParserTest.cs`.
 *
 * Dos diferencias deliberadas con el original, ninguna de comportamiento:
 *
 * 1. Los casos que allí cargan `Digital Clock.CircuitProject` para sacar los nombres de los
 *    pines del sumador de 4 bits aquí los declaran a mano, porque el proyecto todavía no sabe
 *    leer un `.CircuitProject` (llega en M2-05). El orden de la lista da igual: el test y el
 *    parser usan la misma, que es justo lo que hacía `InputIndex(socket, …)`.
 * 2. El original siembra sus `Random` con el reloj; aquí la semilla es fija, para que el test
 *    sea reproducible. Se generan los mismos tipos de valores (enteros de 31 bits sin signo).
 */

const NO_PINS: ExpressionPins = { inputs: [], outputs: [] }
const NO_STATE: ExpressionState = { input: [], output: [] }

/** Los pines del sumador de 4 bits: entradas `c`, `x1`, `x2`; salidas `s` y `c'`. */
const ADDER_PINS: ExpressionPins = { inputs: ['c', 'x1', 'x2'], outputs: ['s', "c'"] }

/** Los mismos pines con los nombres que les pone `ExpressionParserVariableCaseParseTest`. */
const CASE_PINS: ExpressionPins = {
  inputs: ['c', 'variant', 'vaRIAnt'],
  outputs: ['VAriaNT', 'VARIANT'],
}

/** Estado por nombre, como `state.Input[this.InputIndex(socket, "c")] = 1` en el original. */
function stateOf(
  pins: ExpressionPins,
  inputs: Readonly<Record<string, number>>,
  outputs: Readonly<Record<string, number>>,
): ExpressionState {
  return {
    input: pins.inputs.map((name) => inputs[name] ?? 0),
    output: pins.outputs.map((name) => outputs[name] ?? 0),
  }
}

/** El `Valid(parser, state, expected, text)` del original. */
function valid(
  parser: ExpressionParser,
  state: ExpressionState,
  expected: number,
  text: string,
): void {
  const expr = parser.parse(text)
  if (expr === null) {
    throw new Error(`No compila [${text}]: ${parser.errorText}`)
  }
  expect(parser.errorCount, `errores inesperados en [${text}]`).toBe(0)
  expect(expr(state), `[${text}]`).toBe(expected)
}

/** El `Valid(parser, state, expected, text, inverted)` del original. */
function validPredicate(
  parser: ExpressionParser,
  state: ExpressionState,
  expected: boolean,
  text: string,
  inverted: boolean,
): void {
  const predicate = parser.parsePredicate(text, inverted)
  if (predicate === null) {
    throw new Error(`No compila [${text}]: ${parser.errorText}`)
  }
  expect(parser.errorCount, `errores inesperados en [${text}]`).toBe(0)
  expect(predicate(state), `[${text}] con inverted=${String(inverted)}`).toBe(expected)
}

/** El `Invalid(...)` del original, con su patrón opcional sobre el texto del error. */
function invalid(
  parser: ExpressionParser,
  state: ExpressionState,
  text: string,
  pattern?: string,
): string {
  const expr = parser.parse(text)
  expect(expr, `Debía fallar [${text}]`).toBeNull()
  expect(parser.errorCount, `Debía haber un error en [${text}]`).toBeGreaterThan(0)

  const error = parser.errorText
  if (pattern !== undefined) {
    // El original casa con `RegexOptions.IgnoreCase | RegexOptions.CultureInvariant`.
    expect(error, `Otro error en [${text}]`).toMatch(new RegExp(pattern, 'i'))
  }
  return error
}

function adder(): { parser: ExpressionParser; state: ExpressionState } {
  return {
    parser: new ExpressionParser(ADDER_PINS),
    state: stateOf(ADDER_PINS, { c: 1, x1: 5, x2: 4 }, { s: 9, "c'": 1 }),
  }
}

/** Enteros sin signo de 31 bits, como los `Random.Next()` del original pero con semilla fija. */
function integers(count: number): number[] {
  let state = 0x5eed
  const values: number[] = []
  for (let i = 0; i < count; i += 1) {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    // `>>> 1` deja siempre un valor de 31 bits, así que nunca sale negativo.
    values.push((t ^ (t >>> 14)) >>> 1)
  }
  return values
}

/** El `ToBinary` del original: dígitos al revés, el prefijo pegado y el signo delante. */
function toBinary(n: number): string {
  const sign = Math.sign(n)
  let value = Math.abs(n)
  let text = ''
  do {
    text += String(value & 1)
    value >>= 1
  } while (value !== 0)
  text += 'b0'
  if (sign < 0) {
    text += '-'
  }
  return [...text].reverse().join('')
}

function toOctal(n: number): string {
  const sign = Math.sign(n)
  let value = Math.abs(n)
  let text = ''
  do {
    text += String(value & 7)
    value >>= 3
  } while (value !== 0)
  text += '0'
  if (sign < 0) {
    text += '-'
  }
  return [...text].reverse().join('')
}

/** El `"0x" + n.ToString("x")` del original: complemento a dos y sin ceros a la izquierda. */
function toHex(n: number): string {
  return `0x${(n >>> 0).toString(16)}`
}

describe('literales decimales', () => {
  it('lee los números y rechaza lo que no cabe en un int', () => {
    // El original crea aquí un parser con `socket = null`; sin pines no hay variables, así que
    // una lista vacía es lo mismo.
    const parser = new ExpressionParser(NO_PINS)

    valid(parser, NO_STATE, 0, '0')
    valid(parser, NO_STATE, 1, '1')
    valid(parser, NO_STATE, 10, '10')
    valid(parser, NO_STATE, 123, '123')
    valid(parser, NO_STATE, 345, '345')
    valid(parser, NO_STATE, 567, '567')
    valid(parser, NO_STATE, 789, '789')
    valid(parser, NO_STATE, 900, '900')
    valid(parser, NO_STATE, 2147483647, String(2147483647))

    for (const n of integers(1000)) {
      valid(parser, NO_STATE, n, String(n))
    }

    invalid(parser, NO_STATE, '12345678901')
    invalid(parser, NO_STATE, '123456789012345678901234567890')
  })
})

describe('literales binarios', () => {
  it('lee 0b y rechaza los dígitos que no son suyos', () => {
    const parser = new ExpressionParser(NO_PINS)

    valid(parser, NO_STATE, 0, toBinary(0))
    valid(parser, NO_STATE, 1, toBinary(1))
    valid(parser, NO_STATE, 10, toBinary(10))
    valid(parser, NO_STATE, 123, toBinary(123))
    valid(parser, NO_STATE, 345, toBinary(345))
    valid(parser, NO_STATE, 567, toBinary(567))
    valid(parser, NO_STATE, 789, toBinary(789))
    valid(parser, NO_STATE, 900, toBinary(900))
    valid(parser, NO_STATE, 2147483647, toBinary(2147483647))

    for (const n of integers(1000)) {
      valid(parser, NO_STATE, n, toBinary(n))
    }

    // Más de 32 bits: el token es válido pero el número no cabe.
    invalid(parser, NO_STATE, '0b1010101010101010101010101010101010101010101010101')
    invalid(parser, NO_STATE, '0b101010101010101010101010101010101010101010101010101010101')
    // Un dígito que no es binario parte el número en dos literales seguidos.
    invalid(parser, NO_STATE, '0b102')
    invalid(parser, NO_STATE, '0b105')
    invalid(parser, NO_STATE, '0b109')
    invalid(parser, NO_STATE, '0b103')
  })
})

describe('literales octales', () => {
  it('lee el cero delante como octal', () => {
    const parser = new ExpressionParser(NO_PINS)

    valid(parser, NO_STATE, 0, toOctal(0))
    valid(parser, NO_STATE, 1, toOctal(1))
    valid(parser, NO_STATE, 10, toOctal(10))
    valid(parser, NO_STATE, 123, toOctal(123))
    valid(parser, NO_STATE, 345, toOctal(345))
    valid(parser, NO_STATE, 567, toOctal(567))
    valid(parser, NO_STATE, 789, toOctal(789))
    valid(parser, NO_STATE, 900, toOctal(900))
    valid(parser, NO_STATE, 2147483647, toOctal(2147483647))

    for (const n of integers(1000)) {
      valid(parser, NO_STATE, n, toOctal(n))
    }

    invalid(parser, NO_STATE, '0123456701234')
    invalid(parser, NO_STATE, '012345670123567')
    invalid(parser, NO_STATE, '012345678')
    invalid(parser, NO_STATE, '012345679')
  })
})

describe('literales hexadecimales', () => {
  it('lee 0x y acepta los 32 bits como complemento a dos', () => {
    const parser = new ExpressionParser(NO_PINS)

    valid(parser, NO_STATE, 0, toHex(0))
    valid(parser, NO_STATE, 1, toHex(1))
    valid(parser, NO_STATE, 10, toHex(10))
    valid(parser, NO_STATE, 123, toHex(123))
    valid(parser, NO_STATE, 345, toHex(345))
    valid(parser, NO_STATE, 567, toHex(567))
    valid(parser, NO_STATE, 789, toHex(789))
    valid(parser, NO_STATE, 900, toHex(900))
    valid(parser, NO_STATE, 2147483647, toHex(2147483647))
    // `0x80000000` no cabe en un `int` positivo, pero sí como bit pattern: es `int.MinValue`.
    valid(parser, NO_STATE, -2147483648, toHex(-2147483648))

    for (const n of integers(1000)) {
      valid(parser, NO_STATE, n, toHex(n))
    }

    invalid(parser, NO_STATE, '0x123456780')
    invalid(parser, NO_STATE, '0x123456780123456')
  })
})

describe('la disyunción y la conjunción lógicas', () => {
  it('dan 1 o 0 según los dos lados sean cero o no', () => {
    const parser = new ExpressionParser(NO_PINS)

    valid(parser, NO_STATE, 0, '0 || 0')
    valid(parser, NO_STATE, 0, '0 || 0 || 0 || 0 || 0')
    valid(parser, NO_STATE, 1, '0 || 2')
    valid(parser, NO_STATE, 1, '5 || 0')
    valid(parser, NO_STATE, 1, '1 || -3')
    valid(parser, NO_STATE, 1, '0 || 0 || 0 || 0 || 0 || 5')

    invalid(parser, NO_STATE, '1 || ')
    invalid(parser, NO_STATE, '1 || 0 ||')

    // `&&` está más pegado que `||`.
    valid(parser, NO_STATE, 0, '0 || 3 && 0')
    valid(parser, NO_STATE, 1, '2 || 3 && 0')
    valid(parser, NO_STATE, 1, '-2 || -3 && 0')

    valid(parser, NO_STATE, 0, '0 && 0')
    valid(parser, NO_STATE, 0, '0 && 0 && 0 && 0 && 0')
    valid(parser, NO_STATE, 0, '0 && 2')
    valid(parser, NO_STATE, 0, '5 && 0')
    valid(parser, NO_STATE, 1, '1 && 3')
    valid(parser, NO_STATE, 0, '1 && 2 && 3 && 4 && 5 && 0')

    invalid(parser, NO_STATE, '1 && ')
    invalid(parser, NO_STATE, '1 && 0 &&')

    // La igualdad está más pegada que `&&`.
    valid(parser, NO_STATE, 0, '1 && 3 == 0')
    valid(parser, NO_STATE, 0, '~1 && 3 == 0')
  })
})

describe('la igualdad y la comparación', () => {
  it('dan 1 o 0', () => {
    const parser = new ExpressionParser(NO_PINS)

    valid(parser, NO_STATE, 1, '0 = 0')
    valid(parser, NO_STATE, 1, '-1 == -1')
    valid(parser, NO_STATE, 1, '10 = 10')
    valid(parser, NO_STATE, 0, '0 = 10')
    valid(parser, NO_STATE, 0, '5 == 3')

    invalid(parser, NO_STATE, '1 = ')
    invalid(parser, NO_STATE, '1 = 1 ==')

    // La suma está más pegada que la igualdad.
    valid(parser, NO_STATE, 0, '3 = 3 + 1')

    valid(parser, NO_STATE, 0, '0 != 0')
    valid(parser, NO_STATE, 1, '0 != 1')
    valid(parser, NO_STATE, 1, '-1 <> 1')
    valid(parser, NO_STATE, 0, '1 <> 1')
    valid(parser, NO_STATE, 0, '-1 != -1')
    valid(parser, NO_STATE, 1, '-1 != -2')

    invalid(parser, NO_STATE, '3 != ')
    invalid(parser, NO_STATE, '3 != 2 = ')

    valid(parser, NO_STATE, 1, '3 != 3 + 10')

    valid(parser, NO_STATE, 0, '0 < 0')
    valid(parser, NO_STATE, 1, '0 < 1')
    valid(parser, NO_STATE, 1, '-1 < 1')
    valid(parser, NO_STATE, 1, '-3 < -1')
    valid(parser, NO_STATE, 0, '-1 < -3')
    valid(parser, NO_STATE, 0, '-1 < -1')

    invalid(parser, NO_STATE, '3 < ')
    invalid(parser, NO_STATE, '3 < 2 < ')

    valid(parser, NO_STATE, 1, '3 < 3 + 10')

    valid(parser, NO_STATE, 1, '0 <= 0')
    valid(parser, NO_STATE, 1, '0 <= 1')
    valid(parser, NO_STATE, 1, '-1 <= 1')
    valid(parser, NO_STATE, 1, '-3 <= -1')
    valid(parser, NO_STATE, 0, '-1 <= -3')
    valid(parser, NO_STATE, 1, '-1 <= -1')

    invalid(parser, NO_STATE, '3 <= ')
    invalid(parser, NO_STATE, '3 <= 2 <= ')

    valid(parser, NO_STATE, 1, '3 <= 3 + 10')

    valid(parser, NO_STATE, 1, '0 >= 0')
    valid(parser, NO_STATE, 0, '0 >= 1')
    valid(parser, NO_STATE, 0, '-1 >= 1')
    valid(parser, NO_STATE, 0, '-3 >= -1')
    valid(parser, NO_STATE, 1, '-1 >= -3')
    valid(parser, NO_STATE, 1, '-1 >= -1')

    invalid(parser, NO_STATE, '3 >= ')
    invalid(parser, NO_STATE, '3 >= 2 >= ')

    valid(parser, NO_STATE, 1, '30 >= 3 + 10')

    valid(parser, NO_STATE, 0, '0 > 0')
    valid(parser, NO_STATE, 0, '0 > 1')
    valid(parser, NO_STATE, 0, '-1 > 1')
    valid(parser, NO_STATE, 0, '-3 > -1')
    valid(parser, NO_STATE, 1, '-1 > -3')
    valid(parser, NO_STATE, 0, '-1 > -1')

    invalid(parser, NO_STATE, '3 > ')
    invalid(parser, NO_STATE, '3 > 2 > ')

    valid(parser, NO_STATE, 1, '30 > 3 + 10')
  })
})

describe('la suma y el producto', () => {
  it('son la aritmética de un int de 32 bits', () => {
    const parser = new ExpressionParser(NO_PINS)

    valid(parser, NO_STATE, 0, '0 + 0')
    valid(parser, NO_STATE, 2, '1 + 1')
    valid(parser, NO_STATE, 6, '1 + 2 + 3')
    valid(parser, NO_STATE, -18, '10 + 2 - 30')
    valid(parser, NO_STATE, 8, '10 - 2')
    valid(parser, NO_STATE, -12, '-10 - 2')

    invalid(parser, NO_STATE, '3 + ')
    invalid(parser, NO_STATE, '5 - ')
    invalid(parser, NO_STATE, '3 - 2 + ')
    invalid(parser, NO_STATE, '3 + 2 - ')

    // El producto está más pegado que la suma, y así lo dicen los paréntesis.
    valid(parser, NO_STATE, 7, '1 + 3 * 2')
    valid(parser, NO_STATE, 8, '(1 + 3) * 2')
    valid(parser, NO_STATE, 26, '2 * 3 + 5 * 4')
    valid(parser, NO_STATE, -26, '-2 * 3 - 5 * 4')

    valid(parser, NO_STATE, 0, '0 * 0')
    valid(parser, NO_STATE, 1, '1 * 1')
    valid(parser, NO_STATE, 6, '1 * 2 * 3')
    valid(parser, NO_STATE, -20, '10 * -2')
    valid(parser, NO_STATE, 5, '10 / 2')
    valid(parser, NO_STATE, -4, '100 / -25')
    valid(parser, NO_STATE, 1, '10 % 3')
    valid(parser, NO_STATE, 2, '10 % 4')
    valid(parser, NO_STATE, 0, '10 % 5')
    valid(parser, NO_STATE, 2, '10 * 4 / 5 % 3')

    invalid(parser, NO_STATE, '3 * ')
    invalid(parser, NO_STATE, '5 / ')
    invalid(parser, NO_STATE, '5 % ')
    invalid(parser, NO_STATE, '3 * 2 * ')
    invalid(parser, NO_STATE, '3 / 2 / ')
  })
})

describe('los bit a bit y los desplazamientos', () => {
  it('van más pegados que la aritmética, que es lo que dice la gramática', () => {
    const parser = new ExpressionParser(NO_PINS)

    // No es la precedencia de C: `|`, `^` y `&` se comen antes que `*`, `+` y `%`.
    valid(parser, NO_STATE, 9, '3 * 2 | 1')
    valid(parser, NO_STATE, 36, '1 | 2 * 4 | 8')
    valid(parser, NO_STATE, 4, '4 | 8 / 1 | 2')
    valid(parser, NO_STATE, 2, '4 | 8 | 2 % 0b1 | 0b10')

    valid(parser, NO_STATE, 0, '0 | 0')
    valid(parser, NO_STATE, 1, '1 | 1')
    valid(parser, NO_STATE, 7, '1 | 2 | 4')
    valid(parser, NO_STATE, 1, '1 ^ 1 ^ 1')
    valid(parser, NO_STATE, 0, '1 ^ 1 ^ 1 ^ 1')
    valid(parser, NO_STATE, 0, '1 ^ 1')
    valid(parser, NO_STATE, 0, '198 ^ 198')
    valid(parser, NO_STATE, 3, '1 | 2')

    invalid(parser, NO_STATE, '3 | ')
    invalid(parser, NO_STATE, '5 ^ ')
    invalid(parser, NO_STATE, '3 | 2 ^ ')
    invalid(parser, NO_STATE, '3 ^ 2 | ')

    // `&` y `^` están más pegados que `|`.
    valid(parser, NO_STATE, 7, '7 | 2 & 1')
    valid(parser, NO_STATE, 6, '7 ^ 3 & 1')

    valid(parser, NO_STATE, 0, '0 & 0')
    valid(parser, NO_STATE, 1, '1 & 1')
    valid(parser, NO_STATE, 1, '3 & 1')
    valid(parser, NO_STATE, 198, '198 & 198')
    valid(parser, NO_STATE, 0, '1 & 2')

    invalid(parser, NO_STATE, '3 & ')
    invalid(parser, NO_STATE, '3 & 2 & ')

    // El desplazamiento es lo más pegado de todo.
    valid(parser, NO_STATE, 0xfc, '0xFF & 0xFF << 2')

    valid(parser, NO_STATE, 0, '0 << 0')
    valid(parser, NO_STATE, 2, '1 << 1')
    valid(parser, NO_STATE, 6, '3 << 1')
    valid(parser, NO_STATE, 12, '3 << 2')
    valid(parser, NO_STATE, 3, '7 >> 1')
    valid(parser, NO_STATE, 1, '7 >> 2')
    // El contador se enmascara a 5 bits, en C# y en javascript: `-1` es `31`.
    valid(parser, NO_STATE, 7 >> -1, '7 >> -1')

    invalid(parser, NO_STATE, '3 << ')
    invalid(parser, NO_STATE, '3 << 2 << ')

    valid(parser, NO_STATE, 3, '7 >> --1')
  })
})

describe('las expresiones primarias y unarias', () => {
  it('niegan, complementan y agrupan', () => {
    const parser = new ExpressionParser(NO_PINS)

    valid(parser, NO_STATE, -1, '-1')
    valid(parser, NO_STATE, 3, '--3')
    valid(parser, NO_STATE, 0, '!3')
    valid(parser, NO_STATE, 1, '!0')
    valid(parser, NO_STATE, -8, '~7')

    invalid(parser, NO_STATE, '-')
    invalid(parser, NO_STATE, '!')
    invalid(parser, NO_STATE, '~')
    invalid(parser, NO_STATE, '(3 + 2')

    valid(parser, NO_STATE, 6, '3 * (1 + 1)')
  })
})

describe('los pines', () => {
  it('se leen por su nombre, y la comilla se escapa con comillas dobles', () => {
    const { parser, state } = adder()

    valid(parser, state, 1, 'c')
    valid(parser, state, 5, 'x1')
    valid(parser, state, 4, 'x2')
    valid(parser, state, 9, 's')
    valid(parser, state, 1, '"c\'"')

    invalid(parser, state, 'd')
    invalid(parser, state, '"c\'')
    invalid(parser, state, '"c\'\\')
    invalid(parser, state, '"c\'\\""')
  })

  it('distinguen mayúsculas y minúsculas, como el `StringComparer.Ordinal` del original', () => {
    const parser = new ExpressionParser(CASE_PINS)
    const state = stateOf(CASE_PINS, { c: 1, variant: 5, vaRIAnt: 4 }, { VAriaNT: 9, VARIANT: 1 })

    valid(parser, state, 1, 'c')
    valid(parser, state, 5, 'variant')
    valid(parser, state, 4, 'vaRIAnt')
    valid(parser, state, 9, 'VAriaNT')
    valid(parser, state, 1, 'VARIANT')
  })
})

describe('la forma de predicado', () => {
  it('es el `0 != valor` del original, y su inversa el `0 == valor`', () => {
    const parser = new ExpressionParser(NO_PINS)

    validPredicate(parser, NO_STATE, false, '1', true)
    validPredicate(parser, NO_STATE, false, '-1', true)
    validPredicate(parser, NO_STATE, true, '0', true)
    validPredicate(parser, NO_STATE, false, '10', true)
    validPredicate(parser, NO_STATE, true, '5 - 5', true)
    validPredicate(parser, NO_STATE, true, '-5 + 5', true)

    validPredicate(parser, NO_STATE, true, '1', false)
    validPredicate(parser, NO_STATE, true, '-1', false)
    validPredicate(parser, NO_STATE, false, '0', false)
    validPredicate(parser, NO_STATE, true, '10', false)
    validPredicate(parser, NO_STATE, false, '5 - 5', false)
    validPredicate(parser, NO_STATE, false, '-5 + 5', false)

    // El original escribe aquí `int n = rand.Next(1) * Math.Abs(rand.Next())`, y
    // `Random.Next(1)` siempre devuelve 0: el bucle acaba comprobando «0» mil veces. Se porta
    // tal cual, que es lo que hace el original.
    const n = 0
    for (let i = 0; i < 1000; i += 1) {
      validPredicate(parser, NO_STATE, n === 0, String(n), true)
    }
    for (let i = 0; i < 1000; i += 1) {
      validPredicate(parser, NO_STATE, n !== 0, String(n), false)
    }
  })
})

describe('las funciones del usuario', () => {
  it('sin parámetros se usan como una variable', () => {
    const { parser, state } = adder()

    valid(parser, state, 2, 'C:c+1 C')
    valid(parser, state, 10, 'C:c+x1 C+x2')
    valid(parser, state, 26, 'C:c+1 d:x2+s C*d')
    valid(parser, state, -3, 'a:c+1 b:a*2 a+b-s')
  })

  it('con parámetros se invocan con su lista', () => {
    const { parser, state } = adder()

    valid(parser, state, 4, 'C(a):c+a C(3)')
    valid(parser, state, 8, 'C(a,b):c+a+b C(3,4)')
    valid(parser, state, 9, 'C(a,b):(c==0)*a+(c=1)*b C(3,s)')
    valid(parser, state, 17, 'a(b):c+b b(d):a(x2)*d a(x1)+b(x2)-s')
  })

  it('un parámetro tapa a la función que se llame igual', () => {
    const { parser, state } = adder()

    valid(parser, state, 12, 'd:c+1 f(d):d*4 f(3)')
    valid(parser, state, 12, 'f(d):d*4 d:c+1 f(3)')
  })

  it('avisa de todo lo que puede ir mal', () => {
    const { parser, state } = adder()

    invalid(parser, state, 'c:x1+1 c', "Function name 'c' is conflicting with pin name")
    invalid(parser, state, 'C:x1+1 C:x2+1 C+2', "Function 'C' redefined")
    invalid(
      parser,
      state,
      'C(x1):c+x1 C(2)',
      "Parameter 'x1' is conflicting with pin name in function 'C' definition",
    )
    invalid(
      parser,
      state,
      'C(x,x):c+x C(2,3)',
      "Parameter 'x' is duplicated in function 'C' definition",
    )
    invalid(
      parser,
      state,
      'C(C):c+C C(2)',
      "Parameter 'C' is conflicting with function name in function 'C' definition",
    )
    invalid(parser, state, 'C(x):c+x C', "Function 'C' called with wrong number of parameters")
    invalid(parser, state, 'C(x):c+x U', 'U - input or output pin not found')
    invalid(
      parser,
      state,
      'C(x):x+C(x-1) C(3)',
      "The recursive calls are not supported in function 'C'",
    )
    invalid(parser, state, 'C(x):x+4 C(3,1)', "Function 'C' called with wrong number of parameters")
    invalid(parser, state, 'C(x,y):x+y C(3)', "Function 'C' called with wrong number of parameters")
    invalid(parser, state, 'C(x,y):x+y D(3,4)', "Function 'D' is undefined")
  })
})

describe('lo que el original no prueba pero comparte con C#', () => {
  it('la aritmética de 32 bits da la vuelta al desbordar', () => {
    const parser = new ExpressionParser(NO_PINS)

    // C# compila las expresiones sin comprobar el desbordamiento (`unchecked`).
    valid(parser, NO_STATE, -2147483648, '2147483647 + 1')
    valid(parser, NO_STATE, 0, '2147483647 * 2 + 2')
  })

  it('dividir por cero lanza, como el `DivideByZeroException` del original', () => {
    const parser = new ExpressionParser(NO_PINS)

    const expr = parser.parse('1 / 0')
    expect(expr).not.toBeNull()
    expect(() => expr?.(NO_STATE)).toThrow(RangeError)

    const modulo = parser.parse('1 % 0')
    expect(() => modulo?.(NO_STATE)).toThrow(RangeError)

    // `int.MinValue / -1` tampoco cabe en un `int`. Se llega a `int.MinValue` por el bit
    // pattern, porque `-2147483648` no es un literal válido: el literal sería 2147483648.
    const overflow = parser.parse('0x80000000 / -1')
    expect(() => overflow?.(NO_STATE)).toThrow(RangeError)

    // Y el resto del mismo caso también desborda, aunque el resultado matemático sea 0. Lo
    // dijo el oráculo: en .NET el `rem` del caso especial lanza antes de mirar.
    const moduloOverflow = parser.parse('0x80000000 % -1')
    expect(() => moduloOverflow?.(NO_STATE)).toThrow(RangeError)
  })

  it('el binario y el hexadecimal se leen por valor, no por número de dígitos', () => {
    const parser = new ExpressionParser(NO_PINS)

    // Medido con el oráculo: `NumberStyles.BinaryNumber` y `HexNumber` en un `int` se comportan
    // igual. 32 unos son −1, 2³¹ es `int.MinValue` y los ceros delante no estorban.
    valid(parser, NO_STATE, -1, `0b${'1'.repeat(32)}`)
    valid(parser, NO_STATE, -2147483648, `0b1${'0'.repeat(31)}`)
    valid(parser, NO_STATE, 2147483647, `0b${'1'.repeat(31)}`)
    valid(parser, NO_STATE, 0, `0b${'0'.repeat(32)}`)
    valid(parser, NO_STATE, -1, `0x${'f'.repeat(8)}`)
    // Nueve dígitos, pero el valor sí cabe.
    valid(parser, NO_STATE, -1, '0x0ffffffff')
    valid(parser, NO_STATE, 1, '0x0000000001')
    valid(parser, NO_STATE, -1, `0b0${'1'.repeat(32)}`)

    // Y estos no caben, aunque tengan pocos o muchos dígitos.
    invalid(parser, NO_STATE, `0b${'1'.repeat(33)}`)
    invalid(parser, NO_STATE, '0x100000000')
    invalid(parser, NO_STATE, `0x${'f'.repeat(9)}`)
  })

  it('los decoradores se pueden escribir entre los dígitos', () => {
    const parser = new ExpressionParser(NO_PINS)

    valid(parser, NO_STATE, 1000, '1_000')
    valid(parser, NO_STATE, 1000, "1'000")
    valid(parser, NO_STATE, 65535, '0xFF_FF')
  })
})
