import { describe, expect, it } from 'vitest'

/**
 * Guardián de M6-20: **ningún color hexadecimal a pelo** fuera de los sitios donde toca.
 *
 * Los colores viven en tres lugares y solo tres:
 * - `core/theme/presets.ts`: los temas de fábrica (la fuente de verdad).
 * - `app.css`: el respaldo previo a que arranque JavaScript (anti-destello).
 * - `render/theme-bridge.ts`: valores de emergencia si faltara una variable.
 *
 * Además se permite `core/model/diagram.ts`, donde el gris no es del tema sino el **color por
 * defecto de una capa**, que es dato del usuario (M5).
 *
 * Si alguien vuelve a escribir `ctx.fillStyle = '#3b82f6'`, este test lo caza.
 */

const SOURCES = import.meta.glob<string>(['/src/**/*.ts', '/src/**/*.svelte', '/src/**/*.css'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const ALLOWED = new Set([
  '/src/core/theme/presets.ts',
  '/src/app.css',
  '/src/render/theme-bridge.ts',
  '/src/core/model/diagram.ts',
  '/src/app/settings.ts',
  '/src/app/components/synthesizer/SynthesizerPanel.svelte',
  '/src/core/truthtable/generate.ts',
  '/src/app/components/oscilloscope/Oscilloscope.svelte',
])

/** Quita comentarios para no confundir un `#ff0000` explicativo con un color de verdad. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g

describe('M6-20 · colores hardcodeados', () => {
  it('encuentra los fuentes (si no, el test no estaría probando nada)', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20)
  })

  it('solo los ficheros de tema declaran colores hexadecimales', () => {
    const offenders: string[] = []

    for (const [file, source] of Object.entries(SOURCES)) {
      if (ALLOWED.has(file)) {
        continue
      }
      const found = stripComments(source).match(HEX)
      if (found !== null) {
        offenders.push(`${file}: ${[...new Set(found)].join(', ')}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
