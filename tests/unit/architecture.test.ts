import { describe, expect, it } from 'vitest'

/**
 * Guardián de la regla de oro (criterio de M1-02):
 *
 *     `src/core/` NO puede mirar hacia `render/`, `app/` ni `worker/`.
 *
 * El núcleo es el modelado y la simulación: tiene que poder ejecutarse sin navegador,
 * dentro de un Web Worker (M7) y en Node (estos tests). Si algún día alguien importa
 * `render/` desde `core/`, este test lo para en seco.
 *
 * Los ficheros se leen con `import.meta.glob` en crudo, así que este test no depende de
 * Node ni del sistema de ficheros: funciona en cualquier entorno.
 */

/** Contenido de cada fichero del núcleo, indexado por su ruta. */
const CORE_SOURCES = import.meta.glob<string>('/src/core/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Prefijos que el núcleo tiene prohibido importar. */
const FORBIDDEN = ['/src/render/', '/src/app/', '/src/worker/']

/** Globales del navegador que no pintan nada en el núcleo. */
const BROWSER_GLOBALS = /\b(window|document|localStorage|navigator|requestAnimationFrame)\b/

/** Ficheros con falsos positivos (nombres de variables/propiedades que coinciden). */
const FALSE_POSITIVES = new Set([
  '/src/core/persist/component-import.ts', // variable `document`
  '/src/core/simulate/glitch-detector.ts', // propiedad `window`
])

/** Resuelve una importación relativa, tal y como haría el cargador de módulos. */
export function resolveRelativePath(fromFile: string, specifier: string): string {
  const parts = fromFile.split('/')
  parts.pop() // quita el nombre del fichero
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') {
      continue
    }
    if (segment === '..') {
      parts.pop()
    } else {
      parts.push(segment)
    }
  }
  return parts.join('/')
}

/** Rutas que importa un fichero. Solo las relativas: las de paquete no nos incumben. */
function importedPaths(source: string): string[] {
  const specifiers: string[] = []
  const pattern = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1]
    if (specifier !== undefined && specifier.startsWith('.')) {
      specifiers.push(specifier)
    }
  }
  return specifiers
}

describe('utilidades del propio test', () => {
  it('resuelve rutas relativas como el cargador de módulos', () => {
    expect(resolveRelativePath('/src/core/model/types.ts', './a')).toBe('/src/core/model/a')
    expect(resolveRelativePath('/src/core/model/types.ts', '../b')).toBe('/src/core/b')
    expect(resolveRelativePath('/src/core/model/types.ts', '../../render/x')).toBe('/src/render/x')
  })
})

describe('arquitectura', () => {
  const files = Object.keys(CORE_SOURCES)

  it('encuentra el núcleo (si no, el test no estaría probando nada)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('`src/core/` no importa nada de `render/`, `app/` ni `worker/`', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = CORE_SOURCES[file]
      if (source === undefined) {
        continue
      }
      for (const specifier of importedPaths(source)) {
        const target = resolveRelativePath(file, specifier)
        if (FORBIDDEN.some((prefix) => target.startsWith(prefix))) {
          offenders.push(`${file} → ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('el núcleo no depende del navegador (ni `window`, ni `document`)', () => {
    const offenders = files
      .filter((file) => !FALSE_POSITIVES.has(file))
      .filter((file) => BROWSER_GLOBALS.test(CORE_SOURCES[file] ?? ''))

    expect(offenders).toEqual([])
  })
})
