import type { GridPoint, Id } from './types'

/** Una nota de texto anclada a una coordenada del circuito. */
export interface CircuitAnnotation {
  readonly id: Id
  readonly position: GridPoint
  readonly text: string
}

/** Una marca visual anclada a una coordenada del circuito. */
export interface CircuitMarker {
  readonly id: Id
  readonly position: GridPoint
  readonly label: string
}
