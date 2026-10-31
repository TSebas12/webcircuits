/**
 * Léxico HDL (M9-01).
 *
 * Versión mínima del `HdlLexer.g4` del original, portada a TypeScript. Devuelve una
 * lista de tokens (sin espacios ni comentarios). La gramática completa y el parser
 * llegan en M9-02/M9-03.
 */

export type HdlTokenType =
  | 'CHIP'
  | 'BEGIN'
  | 'END'
  | 'PARTS'
  | 'IN'
  | 'OUT'
  | 'COMMA'
  | 'SEMICOLON'
  | 'OPEN'
  | 'CLOSE'
  | 'EQUAL'
  | 'OPEN_BIT'
  | 'CLOSE_BIT'
  | 'ELAPSE'
  | 'IDENTIFIER'
  | 'NUMBER'
  | 'EOF'

export interface HdlToken {
  readonly type: HdlTokenType
  readonly text: string
  readonly line: number
  readonly column: number
}

const KEYWORDS: Readonly<Record<string, HdlTokenType>> = {
  CHIP: 'CHIP',
  IN: 'IN',
  OUT: 'OUT',
}

export function tokenizeHdl(source: string): HdlToken[] {
  const tokens: HdlToken[] = []
  let i = 0
  let line = 1
  let column = 1

  function advance(ch: string): void {
    if (ch === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }

  while (i < source.length) {
    const ch = source.charAt(i)

    // Espacios
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\f') {
      advance(ch)
      i += 1
      continue
    }

    // Comentarios de línea
    if (ch === '/' && source.charAt(i + 1) === '/') {
      while (i < source.length && source.charAt(i) !== '\n') {
        advance(source.charAt(i))
        i += 1
      }
      continue
    }
    // Comentarios de bloque
    if (ch === '/' && source.charAt(i + 1) === '*') {
      i += 2
      column += 2
      while (i < source.length && !(source.charAt(i) === '*' && source.charAt(i + 1) === '/')) {
        advance(source.charAt(i))
        i += 1
      }
      if (i < source.length) {
        advance(source.charAt(i))
        i += 1
        advance(source.charAt(i) ?? '')
        i += 1
      }
      continue
    }

    const startLine = line
    const startCol = column

    // Multi-carácter
    if (source.startsWith('PARTS:', i)) {
      tokens.push({ type: 'PARTS', text: 'PARTS:', line: startLine, column: startCol })
      for (let k = 0; k < 6; k += 1) advance(source.charAt(i + k))
      i += 6
      continue
    }
    if (source.startsWith('..', i)) {
      tokens.push({ type: 'ELAPSE', text: '..', line: startLine, column: startCol })
      advance('.')
      advance('.')
      i += 2
      continue
    }

    switch (ch) {
      case '{':
        tokens.push({ type: 'BEGIN', text: ch, line: startLine, column: startCol })
        break
      case '}':
        tokens.push({ type: 'END', text: ch, line: startLine, column: startCol })
        break
      case ',':
        tokens.push({ type: 'COMMA', text: ch, line: startLine, column: startCol })
        break
      case ';':
        tokens.push({ type: 'SEMICOLON', text: ch, line: startLine, column: startCol })
        break
      case '(':
        tokens.push({ type: 'OPEN', text: ch, line: startLine, column: startCol })
        break
      case ')':
        tokens.push({ type: 'CLOSE', text: ch, line: startLine, column: startCol })
        break
      case '=':
        tokens.push({ type: 'EQUAL', text: ch, line: startLine, column: startCol })
        break
      case '[':
        tokens.push({ type: 'OPEN_BIT', text: ch, line: startLine, column: startCol })
        break
      case ']':
        tokens.push({ type: 'CLOSE_BIT', text: ch, line: startLine, column: startCol })
        break
      default: {
        if (/[A-Za-z]/.test(ch)) {
          let j = i
          while (j < source.length && /[A-Za-z0-9]/.test(source.charAt(j))) j += 1
          const text = source.slice(i, j)
          const type = KEYWORDS[text] ?? 'IDENTIFIER'
          tokens.push({ type, text, line: startLine, column: startCol })
          for (let k = i; k < j; k += 1) advance(source.charAt(k))
          i = j - 1
        } else if (/[0-9]/.test(ch)) {
          let j = i
          while (j < source.length && /[0-9]/.test(source.charAt(j))) j += 1
          const text = source.slice(i, j)
          tokens.push({ type: 'NUMBER', text, line: startLine, column: startCol })
          for (let k = i; k < j; k += 1) advance(source.charAt(k))
          i = j - 1
        } else {
          throw new Error(`carácter inesperado '${ch}' en línea ${startLine}`)
        }
      }
    }
    advance(ch)
    i += 1
  }

  tokens.push({ type: 'EOF', text: '', line, column })
  return tokens
}