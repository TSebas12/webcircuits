/**
 * Parser mínimo del HDL del original (M9-02).
 *
 * Construye un AST sencillo (`HdlModule`) a partir de los tokens del lexer. Cubre
 * la forma básica:
 *
 *   CHIP Nombre {
 *     IN a, b;
 *     OUT out;
 *     PARTS:
 *       and(a=a, b=b, out=out);
 *   }
 */

import { tokenizeHdl, type HdlToken, type HdlTokenType } from './lexer'

export interface HdlConnection {
  readonly name: string
  readonly value: string
}

export interface HdlPart {
  readonly name: string
  readonly connections: readonly HdlConnection[]
}

export interface HdlModule {
  readonly name: string
  readonly inputs: readonly string[]
  readonly outputs: readonly string[]
  readonly parts: readonly HdlPart[]
}

class Parser {
  private readonly tokens: HdlToken[]
  private i = 0

  constructor(source: string) {
    this.tokens = tokenizeHdl(source)
  }

  private peek(): HdlToken {
    return (this.tokens[this.i] ?? this.tokens[this.tokens.length - 1]) as HdlToken
  }

  private next(): HdlToken {
    const t = this.peek()
    if (this.i < this.tokens.length - 1) this.i += 1
    return t
  }

  private expect(type: HdlTokenType): HdlToken {
    const t = this.peek()
    if (t.type !== type) throw new Error(`esperaba ${type}, recibió ${t.type}`)
    return this.next()
  }

  parse(): HdlModule {
    this.expect('CHIP')
    const name = this.expect('IDENTIFIER').text
    this.expect('BEGIN')
    const inputs = this.parseList('IN')
    const outputs = this.parseList('OUT')
    this.expect('PARTS') // 'PARTS:' ya viene como PARTS
    const parts: HdlPart[] = []
    while (this.peek().type !== 'END' && this.peek().type !== 'EOF') {
      parts.push(this.parsePart())
    }
    this.expect('END')
    return { name, inputs, outputs, parts }
  }

  private parseList(keyword: 'IN' | 'OUT'): string[] {
    // keyword opcional
    if (this.peek().type === keyword) this.next()
    const items: string[] = []
    if (this.peek().type === 'IDENTIFIER') {
      items.push(this.next().text)
      while (this.peek().type === 'COMMA') {
        this.next()
        items.push(this.expect('IDENTIFIER').text)
      }
    }
    if (this.peek().type === 'SEMICOLON') this.next()
    return items
  }

  private parsePart(): HdlPart {
    const name = this.expect('IDENTIFIER').text
    this.expect('OPEN')
    const connections: HdlConnection[] = []
    if (this.peek().type !== 'CLOSE') {
      connections.push(this.parseConnection())
      while (this.peek().type === 'COMMA') {
        this.next()
        connections.push(this.parseConnection())
      }
    }
    this.expect('CLOSE')
    if (this.peek().type === 'SEMICOLON') this.next()
    return { name, connections }
  }

  private parseConnection(): HdlConnection {
    const name = this.expect('IDENTIFIER').text
    this.expect('EQUAL')
    const valueToken = this.peek()
    let value: string
    if (valueToken.type === 'IDENTIFIER' || valueToken.type === 'NUMBER') {
      value = this.next().text
    } else {
      throw new Error(`valor inesperado ${valueToken.type}`)
    }
    return { name, value }
  }
}

export function parseHdl(source: string): HdlModule {
  return new Parser(source).parse()
}