/**
 * Formato de componente reutilizable (`.wccomp`, M4C-01).
 *
 * Un componente es **un subcircuito con su nombre y sus dependencias**, empaquetado para
 * viajar entre proyectos. El documento no guarda una foto del proyecto entero: guarda solo
 * los circuitos que hacen falta, con el circuito raíz marcado en `rootCircuitId`.
 *
 * La forma de cada circuito es la misma que la del JSON nativo (`SerializedCircuit`), así
 * que importar un componente no obliga a mantener dos traductores de elementos. La diferencia
 * está en la cabecera: `format`, `version`, `kind` y `metadata` identifican el paquete y
 * permiten rechazar un fichero viejo o ajeno antes de tocar el modelo.
 *
 * Este módulo es solo el **esquema y la validación**. Exportar un subcircuito (M4C-02),
 * importarlo (M4C-03) y resolver dependencias (M4C-05) se apoyan en él, pero no viven aquí.
 */

import type { SerializedCircuit } from './json'

/** Marca del fichero. No se confunde con el `format` del proyecto completo. */
export const COMPONENT_FORMAT_NAME = 'webcircuits-component'

/** Versión del esquema. Sube cuando cambie la forma, no cuando cambie el contenido. */
export const COMPONENT_FORMAT_VERSION = 1

/** Lo que la biblioteca necesita para listar un componente sin abrirlo. */
export interface ComponentMetadata {
  readonly name: string
  readonly description: string
  readonly author: string
  /** Fecha ISO 8601. Se guarda como texto para no depender de la zona horaria. */
  readonly createdAt: string
  readonly tags: readonly string[]
}

/**
 * Un componente listo para escribir en disco.
 *
 * `circuits` incluye el raíz y todas sus dependencias. El orden no importa, pero el raíz
 * tiene que estar presente: si no, el paquete no se puede usar.
 */
export interface SerializedComponent {
  readonly format: typeof COMPONENT_FORMAT_NAME
  readonly version: number
  readonly kind: 'component'
  readonly metadata: ComponentMetadata
  readonly rootCircuitId: string
  readonly circuits: readonly SerializedCircuit[]
}

/** Por qué no se ha podido leer un componente. La UI puede traducirlo sin mirar el texto. */
export type ComponentFormatErrorCode =
  | 'json'
  | 'format'
  | 'version'
  | 'shape'
  | 'duplicate-circuit'
  | 'missing-root'

/** Error de formato, separado de los errores del motor. */
export class ComponentFormatError extends Error {
  constructor(
    readonly code: ComponentFormatErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ComponentFormatError'
  }
}

/** Los datos mínimos que hay que dar para crear un documento válido. */
export interface ComponentInput {
  readonly metadata: ComponentMetadata
  readonly rootCircuitId: string
  readonly circuits: readonly SerializedCircuit[]
}

/** Crea la cabecera y valida el paquete. Es el punto de entrada para exportar. */
export function createComponentDocument(input: ComponentInput): SerializedComponent {
  return validateComponent({
    format: COMPONENT_FORMAT_NAME,
    version: COMPONENT_FORMAT_VERSION,
    kind: 'component',
    metadata: input.metadata,
    rootCircuitId: input.rootCircuitId,
    circuits: input.circuits,
  })
}

/** Escribe el documento con una forma estable (dos espacios, sin reordenar claves). */
export function serializeComponent(component: SerializedComponent): string {
  return JSON.stringify(validateComponent(component), null, 2)
}

/**
 * Lee un `.wccomp` de texto.
 *
 * El JSON se valida **antes** de devolverlo: quien importe no debería encontrarse un
 * componente a medias y descubrirlo al colocar el subcircuito.
 */
export function parseComponent(text: string): SerializedComponent {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new ComponentFormatError('json', 'El componente no contiene JSON válido.')
  }
  return validateComponent(value)
}

/**
 * Comprueba y normaliza un documento.
 *
 * Los campos opcionales de los circuitos (`layers`, `annotations`, `markers`, `busGroups`)
 * se conservan tal cual: el validador del proyecto ya sabe leerlos y aquí no se duplica esa
 * responsabilidad. Lo que sí se exige es que los circuitos tengan id y lista de elementos,
 * que no haya ids repetidos y que el raíz exista.
 */
export function validateComponent(value: unknown): SerializedComponent {
  const root = asRecord(value)
  if (root === null) {
    throw new ComponentFormatError('shape', 'El componente debe ser un objeto.')
  }

  if (root.format !== COMPONENT_FORMAT_NAME) {
    throw new ComponentFormatError(
      'format',
      `Formato desconocido: ${String(root.format)}. Se esperaba ${COMPONENT_FORMAT_NAME}.`,
    )
  }

  const version = root.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ComponentFormatError('version', 'La versión del componente no es válida.')
  }
  if (version > COMPONENT_FORMAT_VERSION) {
    throw new ComponentFormatError(
      'version',
      `Versión no soportada: ${version} (esta versión llega a ${COMPONENT_FORMAT_VERSION}).`,
    )
  }

  if (root.kind !== 'component') {
    throw new ComponentFormatError('shape', 'El documento no es un componente.')
  }

  const metadata = parseMetadata(root.metadata)
  const rootCircuitId = requiredString(root.rootCircuitId, 'rootCircuitId')
  const rawCircuits = root.circuits
  if (!Array.isArray(rawCircuits) || rawCircuits.length === 0) {
    throw new ComponentFormatError('shape', 'El componente no trae circuitos.')
  }

  const circuits: SerializedCircuit[] = []
  const ids = new Set<string>()
  for (const rawCircuit of rawCircuits) {
    const circuit = parseCircuit(rawCircuit)
    if (ids.has(circuit.id)) {
      throw new ComponentFormatError(
        'duplicate-circuit',
        `El circuito ${circuit.id} aparece más de una vez.`,
      )
    }
    ids.add(circuit.id)
    circuits.push(circuit)
  }

  if (!ids.has(rootCircuitId)) {
    throw new ComponentFormatError(
      'missing-root',
      `El circuito raíz ${rootCircuitId} no está en el componente.`,
    )
  }

  return {
    format: COMPONENT_FORMAT_NAME,
    version,
    kind: 'component',
    metadata,
    rootCircuitId,
    circuits,
  }
}

function parseMetadata(value: unknown): ComponentMetadata {
  const raw = asRecord(value)
  if (raw === null) {
    throw new ComponentFormatError('shape', 'Faltan los metadatos del componente.')
  }
  const tags = raw.tags
  if (tags !== undefined && !Array.isArray(tags)) {
    throw new ComponentFormatError('shape', 'Las etiquetas del componente deben ser una lista.')
  }
  return {
    name: requiredString(raw.name, 'metadata.name'),
    description: optionalString(raw.description),
    author: optionalString(raw.author),
    createdAt: optionalString(raw.createdAt),
    tags: (tags ?? []).map((tag) => {
      if (typeof tag !== 'string') {
        throw new ComponentFormatError('shape', 'Cada etiqueta debe ser texto.')
      }
      return tag
    }),
  }
}

function parseCircuit(value: unknown): SerializedCircuit {
  const raw = asRecord(value)
  if (raw === null) {
    throw new ComponentFormatError('shape', 'Cada circuito debe ser un objeto.')
  }
  const id = requiredString(raw.id, 'circuit.id')
  const name = requiredString(raw.name, 'circuit.name')
  const elements = raw.elements
  if (!Array.isArray(elements)) {
    throw new ComponentFormatError('shape', `El circuito ${id} no trae una lista de elementos.`)
  }
  for (const element of elements) {
    const record = asRecord(element)
    if (record === null || typeof record.kind !== 'string') {
      throw new ComponentFormatError('shape', `El circuito ${id} tiene un elemento sin tipo.`)
    }
  }

  // Se conservan las claves opcionales que ya entiende el formato de proyecto.
  return {
    ...raw,
    id,
    name,
    elements: elements as SerializedCircuit['elements'],
  } as SerializedCircuit
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ComponentFormatError('shape', `Falta ${field}.`)
  }
  return value
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
