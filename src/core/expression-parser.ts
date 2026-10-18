/**
 * Parser de las expresiones de filtro (M2-01).
 *
 * Puerto de `Sources/LogicCircuit/ExpressionParser.cs` y de las dos gramáticas que usa,
 * `TruthTableFilterLexer.g4` y `TruthTableFilterParser.g4`.
 *
 * ── Qué se respeta del original ─────────────────────────────────────────────
 *
 * - **La precedencia no es la de C.** La gramática lista las alternativas así:
 *   `<<` > `&` > `^` > `|` > `*` > `+` > comparación > igualdad > `&&` > `||`, y en ANTLR la
 *   alternativa que va antes manda. Por eso los bit a bit quedan **más pegados** que la
 *   aritmética y `3 * 2 | 1` vale 9, no 7. No es un descuido nuestro: lo fijan los tests del
 *   original (`ExpressionParserTest.cs`).
 * - **Enteros de 32 bits con signo**, con vuelta al desbordar (C# es *unchecked*), y los
 *   literales en hex/octal/binario como complemento a dos (`0xffffffff` es −1, `0x80000000`
 *   es `int.MinValue`). El octal es la excepción: `TryParseOctal` del original corta en
 *   `int.MaxValue`, no envuelve, y aquí se copia tal cual.
 * - **División y módulo truncados hacia cero**, y sus dos errores: dividir por cero y
 *   `int.MinValue / -1` lanzan, igual que en C#.
 * - **Las funciones** del usuario: sin parámetros (se usan como variables), con parámetros,
 *   sombreado de parámetros sobre funciones, y todos sus errores.
 * - **Los mensajes**, con los mismos textos que `Properties/Resources.resx`. Se conservan
 *   incluso sus erratas (`Confilits`, `Recusion`) para que el mapa a i18n sea 1:1 con los
 *   nombres de los recursos.
 * - **Las dos fases.** Primero se valida la sintaxis de *toda* la entrada; solo si no hay
 *   errores se resuelven los nombres y se compila. Es lo que hace el original —si ANTLR se
 *   queja, el visitante no llega a correr— y explica un detalle que se pierde al mezclarlas:
 *   el `int.TryParse` de los literales falla en el **visitante**, no en el lexer, así que
 *   `0b1010…` (49 bits) es un *token* válido y un *número* inválido.
 *
 * ── Qué NO se porta ─────────────────────────────────────────────────────────
 *
 * El andamiaje de ANTLR: su máquina de estados, su recuperación de errores y sus objetos de
 * token. En su lugar hay un analizador recursivo-descendente y, en vez de armar un árbol de
 * `System.Linq.Expressions` y compilarlo, se **compila a cierres**, que es el equivalente
 * javascript de `Expression.Lambda(...).Compile()` y lo que de verdad se ejecuta una vez por
 * fila de la tabla. El texto de los errores de *sintaxis* es por tanto nuestro (los del
 * original los redacta ANTLR y no son parte de su contrato); el de los semánticos es suyo.
 */

/** Nombres de los pines del circuito probado, en el orden del circuito. */
export interface ExpressionPins {
  readonly inputs: readonly string[]
  readonly outputs: readonly string[]
}

/** Lo que el original lee de un `TruthState`: `Input` y `Output`, los dos `int[]`. */
export interface ExpressionState {
  readonly input: readonly number[]
  readonly output: readonly number[]
}

export type CompiledExpression = (state: ExpressionState) => number
export type CompiledPredicate = (state: ExpressionState) => boolean

/**
 * Los textos de `Properties/Resources.resx`. Las claves son los nombres **exactos** de los
 * recursos del original: el día que se monte i18n es copiar y traducir, sin renombrar nada.
 */
export const PARSER_MESSAGES = {
  ParserErrorInvalidNumber: (number: string): string => `Invalid number: ${number}`,
  ParserErrorUnexpected: (token: string): string => `${token} unexpected`,
  ParserErrorUnknownPin: (name: string): string => `${name} - input or output pin not found`,
  ParserErrorMissing: (missing: string, token: string): string => `Missing ${missing} at ${token}`,
  ParserErrorParameterConfilitsWithPin: (name: string, fn: string): string =>
    `Parameter '${name}' is conflicting with pin name in function '${fn}' definition`,
  ParserErrorParameterDuplicated: (name: string, fn: string): string =>
    `Parameter '${name}' is duplicated in function '${fn}' definition`,
  ParserErrorParameterConflictsWithFunction: (name: string, fn: string): string =>
    `Parameter '${name}' is conflicting with function name in function '${fn}' definition`,
  ParserErrorFunctionRedefined: (name: string): string => `Function '${name}' redefined`,
  ParserErrorFunctionConflictsWithPin: (name: string): string =>
    `Function name '${name}' is conflicting with pin name`,
  ParserErrorRecusion: (name: string): string =>
    `The recursive calls are not supported in function '${name}'`,
  ParserErrorFunctionUndefined: (name: string): string => `Function '${name}' is undefined`,
  ParserErrorFunctionNumberParameters: (name: string): string =>
    `Function '${name}' called with wrong number of parameters`,
  ParserErrorSyntax: (message: string): string => `Syntax error: ${message}`,
} as const

// ── Léxico ───────────────────────────────────────────────────────────────────

type TokenKind = 'number' | 'string' | 'identifier' | 'punctuation' | 'end'

interface Token {
  readonly kind: TokenKind
  readonly text: string
}

/** Operadores de dos caracteres. Se prueban antes que los de uno, como el «maximal munch». */
const TWO_CHAR_OPERATORS = ['&&', '||', '<<', '>>', '==', '!=', '<>', '<=', '>='] as const

/** Operadores de un carácter. La comilla simple no está: es decorador de número. */
const ONE_CHAR_OPERATORS = '():,+-*/%!~&|^<>='

/** Separadores que el original admite entre los dígitos de un número: `1_000`, `1'000`. */
const DECORATORS = "_'"

const END_OF_INPUT = '<EOF>'

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9'
}

function isBinaryDigit(c: string): boolean {
  return c === '0' || c === '1'
}

function isOctalDigit(c: string): boolean {
  return c >= '0' && c <= '7'
}

function isHexDigit(c: string): boolean {
  return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

function isLetter(c: string): boolean {
  return c === '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

function isIdentifierChar(c: string): boolean {
  return isLetter(c) || isDigit(c)
}

/**
 * Avanza mientras haya dígitos de esa base, admitiendo un decorador entre dos de ellos. El
 * decorador final no se come: en `1_` el número es `1` y `_` empieza un identificador, igual
 * que en la gramática (`DecDigit (NumberDecorator? DecDigit)*`).
 */
function scanDigits(text: string, from: number, isDigitOfBase: (c: string) => boolean): number {
  let i = from
  while (i < text.length) {
    const c = text.charAt(i)
    if (isDigitOfBase(c)) {
      i += 1
    } else if (DECORATORS.includes(c) && isDigitOfBase(text.charAt(i + 1))) {
      i += 2
    } else {
      break
    }
  }
  return i
}

/**
 * Fin del número que empieza en `start`, o `-1` si ahí no empieza ningún número. El orden de
 * las reglas es el de la gramática: primero `0x`, luego `0b`, luego octal (cualquier cosa que
 * empiece por `0`) y por último decimal.
 */
function scanNumber(text: string, start: number): number {
  const first = text.charAt(start)
  const second = text.charAt(start + 1)

  if (first === '0' && (second === 'x' || second === 'X')) {
    return isHexDigit(text.charAt(start + 2)) ? scanDigits(text, start + 2, isHexDigit) : -1
  }

  if (first === '0' && (second === 'b' || second === 'B')) {
    return isBinaryDigit(text.charAt(start + 2)) ? scanDigits(text, start + 2, isBinaryDigit) : -1
  }

  if (first === '0') {
    return scanDigits(text, start + 1, isOctalDigit)
  }

  if (isDigit(first)) {
    return scanDigits(text, start + 1, isDigit)
  }

  return -1
}

/** Fin de la cadena que empieza en `start`, o `-1` si no llega a cerrarse. */
function scanString(text: string, start: number): number {
  let i = start + 1
  while (i < text.length) {
    const c = text.charAt(i)
    if (c === '\\') {
      // Una comilla escapada no cierra la cadena, que es lo que dice la gramática
      // (`'"' ('\\"' | .)*? '"'`) y lo que da sentido al `Replace("\\\"", "\"")` del original.
      i += 2
    } else if (c === '"') {
      return i + 1
    } else {
      i += 1
    }
  }
  return -1
}

interface TokenizeResult {
  readonly tokens: readonly Token[]
  readonly errors: readonly string[]
}

/** Convierte el texto en tokens. Los errores léxicos se devuelven, no se lanzan. */
function tokenize(text: string): TokenizeResult {
  const tokens: Token[] = []
  const errors: string[] = []
  let i = 0

  while (i < text.length) {
    const c = text.charAt(i)

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') {
      i += 1
      continue
    }

    // Los comentarios se saltan, pero solo si de verdad se cierran: si no, `/*` es una
    // división y un asterisco, que es lo que pasaría en ANTLR al no casar la regla entera.
    if (c === '/' && text.charAt(i + 1) === '*') {
      const close = text.indexOf('*/', i + 2)
      if (close !== -1) {
        i = close + 2
        continue
      }
    }

    const two = text.slice(i, i + 2)
    if ((TWO_CHAR_OPERATORS as readonly string[]).includes(two)) {
      tokens.push({ kind: 'punctuation', text: two })
      i += 2
      continue
    }

    if (ONE_CHAR_OPERATORS.includes(c)) {
      tokens.push({ kind: 'punctuation', text: c })
      i += 1
      continue
    }

    if (c === '"') {
      const end = scanString(text, i)
      if (end === -1) {
        errors.push(PARSER_MESSAGES.ParserErrorSyntax('unterminated string literal'))
        break
      }
      tokens.push({ kind: 'string', text: text.slice(i, end) })
      i = end
      continue
    }

    const numberEnd = scanNumber(text, i)
    if (numberEnd !== -1) {
      tokens.push({ kind: 'number', text: text.slice(i, numberEnd) })
      i = numberEnd
      continue
    }

    if (isLetter(c)) {
      let end = i + 1
      while (end < text.length && isIdentifierChar(text.charAt(end))) {
        end += 1
      }
      tokens.push({ kind: 'identifier', text: text.slice(i, end) })
      i = end
      continue
    }

    errors.push(PARSER_MESSAGES.ParserErrorSyntax(`unexpected character '${c}'`))
    break
  }

  tokens.push({ kind: 'end', text: END_OF_INPUT })
  return { tokens, errors }
}

// ── Sintaxis ─────────────────────────────────────────────────────────────────

/** El árbol de la fase sintáctica. Los literales guardan su texto: el número se lee después. */
type Ast =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'variable'; readonly name: string }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly Ast[] }
  | { readonly kind: 'unary'; readonly op: string; readonly operand: Ast }
  | { readonly kind: 'binary'; readonly op: string; readonly left: Ast; readonly right: Ast }

interface AstFunction {
  readonly name: string
  readonly parameters: readonly string[]
  readonly body: Ast
}

interface AstFilter {
  readonly functions: readonly AstFunction[]
  readonly expr: Ast
}

/** Se lanza al primer error de sintaxis y la recoge `ExpressionParser`. */
class SyntaxFailure extends Error {}

/**
 * Los niveles binarios de la gramática, del más suelto al más pegado. Todos son asociativos
 * por la izquierda (`left=expr` en el `.g4`).
 */
const BINARY_LEVELS: readonly (readonly string[])[] = [
  ['||'],
  ['&&'],
  ['==', '=', '!=', '<>'],
  ['<', '<=', '>=', '>'],
  ['+', '-'],
  ['*', '/', '%'],
  ['|'],
  ['^'],
  ['&'],
  ['<<', '>>'],
]

/** Operadores que pueden ir delante de un operando. */
const UNARY_OPERATORS = '+-!~'

class SyntaxParser {
  private pos = 0

  constructor(private readonly tokens: readonly Token[]) {}

  /** El centinela `<EOF>` está siempre al final, así que `pos` nunca se sale del array. */
  private peek(): Token {
    return this.tokens[Math.min(this.pos, this.tokens.length - 1)]!
  }

  private next(): Token {
    const token = this.peek()
    this.pos += 1
    return token
  }

  private fail(message: string): never {
    throw new SyntaxFailure(message)
  }

  /** Así nombra ANTLR a un token en sus mensajes: `'x'`, o `<EOF>`. */
  private display(token: Token): string {
    return token.kind === 'end' ? END_OF_INPUT : `'${token.text}'`
  }

  private failUnexpected(token: Token): never {
    this.fail(PARSER_MESSAGES.ParserErrorUnexpected(this.display(token)))
  }

  private expect(text: string): void {
    const token = this.peek()
    if (token.kind === 'punctuation' && token.text === text) {
      this.next()
      return
    }
    if (token.kind === 'end') {
      this.fail(PARSER_MESSAGES.ParserErrorMissing(`'${text}'`, END_OF_INPUT))
    }
    this.failUnexpected(token)
  }

  private expectIdentifier(): Token {
    const token = this.peek()
    if (token.kind !== 'identifier') {
      if (token.kind === 'end') {
        this.fail(PARSER_MESSAGES.ParserErrorMissing('identifier', END_OF_INPUT))
      }
      this.failUnexpected(token)
    }
    return this.next()
  }

  /** `filter: function* expr EOF`. */
  parseFilter(): AstFilter {
    const functions: AstFunction[] = []
    while (this.startsFunction()) {
      functions.push(this.parseFunction())
    }

    const expr = this.parseExpression()
    const token = this.peek()
    if (token.kind !== 'end') {
      this.failUnexpected(token)
    }
    return { functions, expr }
  }

  /**
   * ¿Lo que viene es una definición de función y no el principio de la expresión? Una función
   * es `identificador ( '(' identificador (',' identificador)* ')' )? ':'`, así que basta con
   * mirar por delante sin retroceder: `C(3)` no lleva dos puntos y por tanto no lo es.
   */
  private startsFunction(): boolean {
    if (this.peek().kind !== 'identifier') {
      return false
    }

    const after = this.tokens[this.pos + 1]
    if (after?.kind !== 'punctuation') {
      return false
    }

    if (after.text === ':') {
      return true
    }

    if (after.text !== '(') {
      return false
    }

    let i = this.pos + 2
    for (;;) {
      if (this.tokens[i]?.kind !== 'identifier') {
        return false
      }
      i += 1

      const separator = this.tokens[i]
      if (separator?.kind !== 'punctuation') {
        return false
      }
      if (separator.text === ',') {
        i += 1
      } else if (separator.text === ')') {
        return this.tokens[i + 1]?.text === ':'
      } else {
        return false
      }
    }
  }

  private parseFunction(): AstFunction {
    const name = this.next().text

    const parameters: string[] = []
    if (this.peek().text === '(') {
      this.next()
      parameters.push(this.expectIdentifier().text)
      while (this.peek().text === ',') {
        this.next()
        parameters.push(this.expectIdentifier().text)
      }
      this.expect(')')
    }

    this.expect(':')
    return { name, parameters, body: this.parseExpression() }
  }

  /** La cascada de la precedencia: de lo más suelto a lo más pegado. */
  private parseExpression(): Ast {
    return this.parseBinary(0)
  }

  private parseBinary(level: number): Ast {
    const operators = BINARY_LEVELS[level]
    if (operators === undefined) {
      return this.parseUnary()
    }

    let left = this.parseBinary(level + 1)
    for (;;) {
      const token = this.peek()
      if (token.kind !== 'punctuation' || !operators.includes(token.text)) {
        return left
      }
      this.next()
      left = { kind: 'binary', op: token.text, left, right: this.parseBinary(level + 1) }
    }
  }

  private parseUnary(): Ast {
    const token = this.peek()
    if (token.kind === 'punctuation' && UNARY_OPERATORS.includes(token.text)) {
      this.next()
      return { kind: 'unary', op: token.text, operand: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Ast {
    const token = this.peek()

    if (token.kind === 'punctuation' && token.text === '(') {
      this.next()
      const inner = this.parseExpression()
      this.expect(')')
      return inner
    }

    if (token.kind === 'number') {
      this.next()
      return { kind: 'literal', text: token.text }
    }

    if (token.kind === 'string') {
      this.next()
      // Se quitan las comillas y `\"` vuelve a ser `"`, que es como se nombra un pin que no
      // sea un identificador, como el `c'` del sumador de 4 bits.
      const name = token.text.slice(1, -1).replaceAll('\\"', '"')
      return { kind: 'variable', name }
    }

    if (token.kind !== 'identifier') {
      if (token.kind === 'end') {
        this.fail(PARSER_MESSAGES.ParserErrorSyntax('end of expression'))
      }
      this.failUnexpected(token)
    }

    const name = this.next().text
    if (this.peek().text !== '(') {
      return { kind: 'variable', name }
    }

    // `functionCall` exige al menos un argumento, así que `C()` no es válido.
    this.next()
    const args: Ast[] = [this.parseExpression()]
    while (this.peek().text === ',') {
      this.next()
      args.push(this.parseExpression())
    }
    this.expect(')')
    return { kind: 'call', name, args }
  }
}

// ── Compilación ──────────────────────────────────────────────────────────────

/** Un trozo de expresión ya compilado. `args` son los parámetros de la función en curso. */
type Compiled = (state: ExpressionState, args: readonly number[]) => number

interface CompiledFunction {
  readonly name: string
  readonly parameters: string[]
  body: Compiled | null
}

/**
 * Lo que en C# lanza `DivideByZeroException` o `OverflowException` al compilar el árbol de
 * expresiones. Se lanza igual porque no hay ningún valor que devolver: dejarlo pasar daría
 * `Infinity`, que en un contexto de bits se convierte en un 0 silencioso y mentiroso.
 */
class ArithmeticError extends RangeError {}

const INT_MIN = -2147483648
const INT_MAX = 2147483647

/** C# es *unchecked*: al desbordar, le da la vuelta al número. */
function toInt32(value: number): number {
  return value | 0
}

function integerDivide(left: number, right: number): number {
  if (right === 0) {
    throw new ArithmeticError('Division by zero')
  }
  if (left === INT_MIN && right === -1) {
    // `int.MinValue / -1` no cabe en un `int`: en C# desborda. Comprobado con el oráculo.
    throw new ArithmeticError('Arithmetic operation resulted in an overflow')
  }
  // `| 0` es exactamente la división entera de C#: trunca hacia cero.
  return toInt32(left / right)
}

function integerModulo(left: number, right: number): number {
  if (right === 0) {
    throw new ArithmeticError('Attempted to divide by zero')
  }
  if (left === INT_MIN && right === -1) {
    // Y el resto desborda igual, aunque el resultado matemático sea 0: en .NET el `rem` del
    // caso especial lanza antes de mirar. Medido con el oráculo, que es donde se ve.
    throw new ArithmeticError('Arithmetic operation resulted in an overflow')
  }
  return toInt32(left % right)
}

/** Los decoradores solo están para poder leerlos: `1_000` es 1000. */
function stripDecorators(text: string): string {
  return text.replaceAll('_', '').replaceAll("'", '')
}

/** El mayor valor que cabe en los 32 bits de un `int` leído como bit pattern. */
const MAX_UNSIGNED_INT = 4294967295

/**
 * Hex y binario, como `NumberStyles.HexNumber` y `BinaryNumber` de .NET: se leen **por valor**,
 * no por número de dígitos —`0x0ffffffff` tiene nueve dígitos y vale −1, mientras que
 * `0x100000000` no cabe—, y el valor se interpreta como complemento a dos de 32 bits.
 * Comprobado con el oráculo, porque los tests del original no llegaban a este rango.
 */
function parseRadix(digits: string, radix: number): number | null {
  if (digits.length === 0) {
    return null
  }

  const isDigitOfBase = radix === 16 ? isHexDigit : isBinaryDigit
  let value = 0
  for (let i = 0; i < digits.length; i += 1) {
    const c = digits.charAt(i)
    if (!isDigitOfBase(c)) {
      return null
    }
    // Se corta en cuanto no cabe, así que `value` nunca pasa de ~7·10⁹ y la aritmética de
    // coma flotante es exacta.
    value = value * radix + parseInt(c, radix)
    if (value > MAX_UNSIGNED_INT) {
      return null
    }
  }
  return toInt32(value)
}

/**
 * El original lo hace a mano y corta en `int.MaxValue`: no envuelve a negativo, así que un
 * octal que pase de ahí es inválido aunque quepa en los 32 bits.
 */
function parseOctal(text: string): number | null {
  let value = 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charAt(i)
    if (!isOctalDigit(c)) {
      return null
    }
    value = value * 8 + parseInt(c, 8)
    if (value > INT_MAX) {
      return null
    }
  }
  return value
}

function parseDecimal(text: string): number | null {
  if (text.length === 0) {
    return null
  }

  let value = 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charAt(i)
    if (!isDigit(c)) {
      return null
    }
    value = value * 10 + parseInt(c, 10)
    if (value > INT_MAX) {
      return null
    }
  }
  return value
}

/** El texto de un literal a número de 32 bits, o `null` si no cabe, como `int.TryParse`. */
function parseLiteral(text: string): number | null {
  const prefix = text.slice(0, 2).toLowerCase()
  if (prefix === '0x') {
    return parseRadix(text.slice(2), 16)
  }
  if (prefix === '0b') {
    return parseRadix(text.slice(2), 2)
  }
  if (text.startsWith('0')) {
    return parseOctal(text)
  }
  return parseDecimal(text)
}

/**
 * El visitante del original: resuelve nombres, aplica las funciones del usuario y compila a
 * cierres. Recorre el árbol en el mismo orden que él —izquierda antes que derecha, y las
 * funciones en el orden en que se declaran— porque de eso depende el orden de los errores.
 */
class Compiler {
  private readonly functions = new Map<string, CompiledFunction>()
  private readonly errors: string[] = []
  private current: CompiledFunction | null = null

  constructor(private readonly pins: ExpressionPins) {}

  get errorCount(): number {
    return this.errors.length
  }

  get errorText(): string {
    // El original acumula líneas en un `StringBuilder`, así que cada error acaba en \n.
    return this.errors.map((error) => `${error}\n`).join('')
  }

  compile(filter: AstFilter): Compiled | null {
    for (const fn of filter.functions) {
      this.compileFunction(fn)
    }
    if (this.errorCount !== 0) {
      return null
    }
    return this.compileNode(filter.expr)
  }

  private error(message: string): void {
    this.errors.push(message)
  }

  private hasPin(name: string): boolean {
    return this.pins.inputs.includes(name) || this.pins.outputs.includes(name)
  }

  private compileFunction(fn: AstFunction): void {
    if (this.hasPin(fn.name)) {
      this.error(PARSER_MESSAGES.ParserErrorFunctionConflictsWithPin(fn.name))
      return
    }

    if (this.functions.has(fn.name)) {
      this.error(PARSER_MESSAGES.ParserErrorFunctionRedefined(fn.name))
      return
    }

    // Se registra **antes** de compilar el cuerpo, con la lista de parámetros todavía vacía:
    // así una llamada a sí misma se ve como recursión y no como función desconocida.
    const function_: CompiledFunction = { name: fn.name, parameters: [], body: null }
    this.functions.set(fn.name, function_)

    for (const parameter of fn.parameters) {
      if (this.hasPin(parameter)) {
        this.error(PARSER_MESSAGES.ParserErrorParameterConfilitsWithPin(parameter, fn.name))
      } else if (function_.parameters.includes(parameter)) {
        this.error(PARSER_MESSAGES.ParserErrorParameterDuplicated(parameter, fn.name))
      } else if (parameter === fn.name) {
        this.error(PARSER_MESSAGES.ParserErrorParameterConflictsWithFunction(parameter, fn.name))
      } else {
        function_.parameters.push(parameter)
      }
    }

    const saved = this.current
    this.current = function_
    try {
      const body = this.compileNode(fn.body)
      if (body !== null) {
        function_.body = body
      }
    } finally {
      this.current = saved
    }
  }

  private compileNode(node: Ast): Compiled | null {
    switch (node.kind) {
      case 'literal':
        return this.compileLiteral(node.text)

      case 'variable':
        return this.compileVariable(node.name)

      case 'call':
        return this.compileCall(node)

      case 'unary': {
        const operand = this.compileNode(node.operand)
        return operand === null ? null : compileUnary(node.op, operand)
      }

      case 'binary': {
        const left = this.compileNode(node.left)
        const right = this.compileNode(node.right)
        return left === null || right === null ? null : compileBinary(node.op, left, right)
      }
    }
  }

  private compileLiteral(raw: string): Compiled {
    const text = stripDecorators(raw)
    const value = parseLiteral(text)
    if (value === null) {
      // El original sigue adelante tras el error y se queda con el 0 que deja `TryParse`.
      this.error(PARSER_MESSAGES.ParserErrorInvalidNumber(text))
      return () => 0
    }
    return () => value
  }

  private compileVariable(name: string): Compiled | null {
    const input = this.pins.inputs.indexOf(name)
    if (input !== -1) {
      return (state) => toInt32(state.input[input] ?? 0)
    }

    const output = this.pins.outputs.indexOf(name)
    if (output !== -1) {
      return (state) => toInt32(state.output[output] ?? 0)
    }

    // El orden manda: primero los pines, luego los parámetros de la función en curso —así un
    // parámetro puede tapar el nombre de una función— y solo después las funciones.
    const parameter = this.current?.parameters.indexOf(name) ?? -1
    if (parameter !== -1) {
      return (_state, args) => toInt32(args[parameter] ?? 0)
    }

    const function_ = this.functions.get(name)
    if (function_ === undefined) {
      this.error(PARSER_MESSAGES.ParserErrorUnknownPin(name))
      return null
    }

    if (function_.parameters.length !== 0) {
      this.error(PARSER_MESSAGES.ParserErrorFunctionNumberParameters(name))
      return null
    }

    if (function_.body === null) {
      this.error(
        name === this.current?.name
          ? PARSER_MESSAGES.ParserErrorRecusion(name)
          : PARSER_MESSAGES.ParserErrorFunctionUndefined(name),
      )
      return null
    }

    const body = function_.body
    return (state) => body(state, [])
  }

  private compileCall(node: Extract<Ast, { kind: 'call' }>): Compiled | null {
    const function_ = this.functions.get(node.name)
    if (function_ === undefined) {
      // Los argumentos ni se compilan, como en el original.
      this.error(PARSER_MESSAGES.ParserErrorFunctionUndefined(node.name))
      return null
    }

    if (function_.body === null) {
      this.error(
        node.name === this.current?.name
          ? PARSER_MESSAGES.ParserErrorRecusion(node.name)
          : PARSER_MESSAGES.ParserErrorFunctionUndefined(node.name),
      )
      return null
    }

    // Se compilan todos los argumentos antes de mirar nada: sus errores se acumulan antes de
    // que el original decida, y solo entonces comprueba el número de parámetros.
    const args: Compiled[] = []
    for (const argument of node.args) {
      const compiled = this.compileNode(argument)
      if (compiled !== null) {
        args.push(compiled)
      }
    }

    if (
      this.errorCount !== 0 ||
      args.length !== node.args.length ||
      args.length !== function_.parameters.length
    ) {
      this.error(PARSER_MESSAGES.ParserErrorFunctionNumberParameters(node.name))
      return null
    }

    const body = function_.body
    return (state, outer) =>
      body(
        state,
        args.map((argument) => argument(state, outer)),
      )
  }
}

function compileUnary(op: string, operand: Compiled): Compiled {
  switch (op) {
    case '+':
      return (state, args) => operand(state, args)
    case '-':
      return (state, args) => toInt32(-operand(state, args))
    case '!':
      return (state, args) => (operand(state, args) === 0 ? 1 : 0)
    case '~':
      return (state, args) => toInt32(~operand(state, args))
    default:
      throw new Error(`operador unario desconocido: ${op}`)
  }
}

function compileBinary(op: string, left: Compiled, right: Compiled): Compiled {
  switch (op) {
    case '*':
      // `Math.imul` es la multiplicación de 32 bits de C#, envoltura incluida.
      return (state, args) => Math.imul(left(state, args), right(state, args))
    case '/':
      return (state, args) => integerDivide(left(state, args), right(state, args))
    case '%':
      return (state, args) => integerModulo(left(state, args), right(state, args))
    case '+':
      return (state, args) => toInt32(left(state, args) + right(state, args))
    case '-':
      return (state, args) => toInt32(left(state, args) - right(state, args))
    case '<<':
      return (state, args) => left(state, args) << right(state, args)
    case '>>':
      return (state, args) => left(state, args) >> right(state, args)
    case '<':
      return (state, args) => (left(state, args) < right(state, args) ? 1 : 0)
    case '<=':
      return (state, args) => (left(state, args) <= right(state, args) ? 1 : 0)
    case '>=':
      return (state, args) => (left(state, args) >= right(state, args) ? 1 : 0)
    case '>':
      return (state, args) => (left(state, args) > right(state, args) ? 1 : 0)
    case '=':
    case '==':
      return (state, args) => (left(state, args) === right(state, args) ? 1 : 0)
    case '<>':
    case '!=':
      return (state, args) => (left(state, args) !== right(state, args) ? 1 : 0)
    case '&':
      return (state, args) => left(state, args) & right(state, args)
    case '^':
      return (state, args) => left(state, args) ^ right(state, args)
    case '|':
      return (state, args) => left(state, args) | right(state, args)
    case '&&':
      // El original compone la conjunción con `Expression.And` sobre dos comparaciones, no con
      // un `AndAlso`: los dos lados se evalúan siempre. Aquí también.
      return (state, args) => (left(state, args) !== 0 && right(state, args) !== 0 ? 1 : 0)
    case '||':
      return (state, args) => (left(state, args) !== 0 || right(state, args) !== 0 ? 1 : 0)
    default:
      throw new Error(`operador binario desconocido: ${op}`)
  }
}

// ── La puerta de entrada ─────────────────────────────────────────────────────

/**
 * Equivalente de `ExpressionParser`: se construye con los pines del circuito probado y compila
 * el texto de un filtro a una función.
 *
 * Ojo: la expresión compilada puede lanzar `ArithmeticError` al evaluarse si el usuario divide
 * por cero, exactamente igual que el `Func<TruthState, int>` que devuelve el original.
 */
export class ExpressionParser {
  private lastErrorCount = 0
  private lastErrorText = ''

  constructor(private readonly pins: ExpressionPins) {}

  get errorCount(): number {
    return this.lastErrorCount
  }

  get errorText(): string {
    return this.lastErrorText
  }

  /** `Parse(text)`: el número que vale la expresión en ese estado, o `null` si no compila. */
  parse(text: string): CompiledExpression | null {
    return this.compile(text)
  }

  /** `Parse(text, inverted)`: el predicado, con la inversión aplicada al final. */
  parsePredicate(text: string, inverted: boolean): CompiledPredicate | null {
    const body = this.parse(text)
    if (body === null) {
      return null
    }
    return inverted ? (state) => body(state) === 0 : (state) => body(state) !== 0
  }

  private compile(text: string): CompiledExpression | null {
    const lexed = tokenize(text)
    if (lexed.errors.length !== 0) {
      this.setErrors(lexed.errors)
      return null
    }

    let filter: AstFilter
    try {
      filter = new SyntaxParser(lexed.tokens).parseFilter()
    } catch (error) {
      if (!(error instanceof SyntaxFailure)) {
        throw error
      }
      // Sin sintaxis no hay semántica: el visitante del original ni se ejecuta.
      this.setErrors([error.message])
      return null
    }

    const compiler = new Compiler(this.pins)
    const expression = compiler.compile(filter)
    this.lastErrorCount = compiler.errorCount
    this.lastErrorText = compiler.errorText
    if (compiler.errorCount !== 0 || expression === null) {
      return null
    }
    // En la raíz no hay parámetros en curso, así que la lista de argumentos va siempre vacía.
    return (state) => expression(state, [])
  }

  private setErrors(errors: readonly string[]): void {
    this.lastErrorCount = errors.length
    this.lastErrorText = errors.map((error) => `${error}\n`).join('')
  }
}
