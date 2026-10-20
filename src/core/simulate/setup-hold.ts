/**
 * Análisis básico de setup/hold (M7B-08).
 */

export interface SetupHoldResult {
  readonly ok: boolean
  readonly setupSlack: number
  readonly holdSlack: number
}

export function checkSetupHold(
  dataArrival: number,
  clockEdge: number,
  setupTime: number,
  holdTime: number,
  dataHoldEnd: number,
): SetupHoldResult {
  const setupSlack = clockEdge - dataArrival - setupTime
  const holdSlack = dataHoldEnd - clockEdge - holdTime
  return { ok: setupSlack >= 0 && holdSlack >= 0, setupSlack, holdSlack }
}