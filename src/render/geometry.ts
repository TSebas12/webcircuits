/**
 * Constantes geométricas del dibujado.
 *
 * Los valores salen del original (`CircuitProject/Symbol.cs`) y son **semánticos**:
 * de `GRID_SIZE` dependen la posición de los pines y el ajuste de la rejilla.
 * Cambiarlos rompería la paridad con los ficheros `.CircuitProject`.
 *
 * ⚠️ Ojo: esto es capa de **renderizado**, no dominio. `src/core/` trabaja siempre en
 * unidades de rejilla y no debe importar nada de aquí.
 */

/** Radio del pin, en píxeles (original: `Symbol.PinRadius`). */
export const PIN_RADIUS = 3

/** Lado de una celda de rejilla, en píxeles al 100 % (original: `Symbol.GridSize`). */
export const GRID_SIZE = PIN_RADIUS * 6 // 18

/** Lado del circuito de una hoja, en unidades de rejilla (original: `Symbol.LogicalCircuitGridWidth`). */
export const CIRCUIT_GRID_WIDTH = 170

/** Alto del circuito de una hoja, en unidades de rejilla (original: `Symbol.LogicalCircuitGridHeight`). */
export const CIRCUIT_GRID_HEIGHT = 170
