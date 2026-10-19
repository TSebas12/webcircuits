/**
 * Ayudantes compartidos por los tests de dibujado.
 *
 * El lienzo de verdad no existe en Node, así que se usa un contexto de mentira que **apunta
 * lo que se le pide**. Como lo que importa no es que el píxel salga bien (eso se mira a ojo
 * o con una captura), sino **qué color y qué forma** se piden, con esto sobra.
 */

/** Una llamada al contexto, con los estilos que había puestos en ese momento. */
export interface RecordedCall {
  readonly name: string
  readonly args: readonly unknown[]
  readonly fillStyle: string
  readonly strokeStyle: string
  readonly lineWidth: number
  readonly shadowBlur: number
  /** Trazo discontinuo vigente en ese momento. */
  readonly lineDash: readonly number[]
}

export interface FakeContext {
  readonly ctx: CanvasRenderingContext2D
  readonly calls: RecordedCall[]
  /** Todas las llamadas con este nombre. */
  named(name: string): RecordedCall[]
}

const METHODS = [
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'arc',
  'arcTo',
  'rect',
  'fill',
  'stroke',
  'save',
  'restore',
  'translate',
  'rotate',
  'scale',
  'setTransform',
  'fillRect',
  'clearRect',
  'setLineDash',
] as const

export function makeFakeContext(): FakeContext {
  const calls: RecordedCall[] = []
  const state: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowBlur: 0,
    shadowColor: '',
    lineJoin: '',
    lineCap: '',
    lineDash: [] as number[],
  }

  const target: Record<string, unknown> = {}
  for (const method of METHODS) {
    target[method] = (...args: unknown[]): void => {
      if (method === 'setLineDash') {
        state.lineDash = Array.isArray(args[0]) ? [...(args[0] as number[])] : []
      }
      calls.push({
        name: method,
        args,
        fillStyle: String(state.fillStyle),
        strokeStyle: String(state.strokeStyle),
        lineWidth: Number(state.lineWidth),
        shadowBlur: Number(state.shadowBlur),
        lineDash: [...(state.lineDash as number[])],
      })
    }
  }

  const ctx = new Proxy(target, {
    get(inner, property: string) {
      return inner[property]
    },
    set(inner, property: string, value: unknown) {
      inner[property] = value
      state[property] = value
      return true
    },
  })

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    calls,
    named: (name) => calls.filter((call) => call.name === name),
  }
}

/**
 * `Path2D` no existe en Node, así que se sustituye por una imitación.
 *
 * Devuelve un contador de cuántas se han construido: eso es lo que permite comprobar que
 * una silueta se hace **una sola vez** y luego se reutiliza.
 */
export function installFakePath2D(): { built(): number; reset(): void } {
  let count = 0

  class Fake {
    constructor() {
      count += 1
    }

    moveTo(): void {}
    lineTo(): void {}
    arc(): void {}
    arcTo(): void {}
    quadraticCurveTo(): void {}
    bezierCurveTo(): void {}
    closePath(): void {}
  }

  ;(globalThis as { Path2D?: unknown }).Path2D = Fake

  return {
    built: () => count,
    reset: () => {
      count = 0
    },
  }
}
