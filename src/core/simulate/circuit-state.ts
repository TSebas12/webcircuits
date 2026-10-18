import { State } from '../function/state'

/**
 * Estado mutable de la simulación: un array de `State` indexado por la posición
 * que el modelo asigna a cada pin, más los avisos que las funciones necesitan.
 *
 * **Esto es un esqueleto.** La implementación real llega en M2-08 (estado y
 * lista de cambios); aquí solo se fija la forma que `CircuitFunction` necesita,
 * para que la jerarquía de `Function/` compile desde M2-03.
 */
export interface CircuitState {
  [index: number]: State
  defineFunction(fn: unknown): void
  markUpdated(fn: unknown): void
}