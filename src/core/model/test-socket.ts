import type { Id, Pin, StoredElement } from './types'

/** Un socket de entrada: envuelve un pin de entrada y guarda el valor que se le fuerza. */
export interface InputPinSocket {
  readonly pinId: Id
  readonly bitWidth: number
  value: number
}

/** Un socket de salida: envuelve un pin de salida y guarda el valor leído. */
export interface OutputPinSocket {
  readonly pinId: Id
  readonly bitWidth: number
  value: number
}

/** El conjunto de sockets de un circuito, listo para probarlo. */
export interface TestSocketSet {
  readonly inputs: readonly InputPinSocket[]
  readonly outputs: readonly OutputPinSocket[]
}

/** Un circuito es probabable si tiene al menos un pin de entrada y uno de salida. */
export function isTestable(elements: readonly StoredElement[]): boolean {
  let hasInput = false
  let hasOutput = false
  for (const element of elements) {
    if (element.kind !== 'pin') continue
    if (element.pinType === 'input') hasInput = true
    else if (element.pinType === 'output') hasOutput = true
    if (hasInput && hasOutput) return true
  }
  return false
}

function pinsOf(elements: readonly StoredElement[], type: Pin['pinType']): Pin[] {
  return elements
    .filter((element): element is Pin => element.kind === 'pin' && element.pinType === type)
    .slice()
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
}

/** Crea los sockets de un circuito. Devuelve `null` si no es probabable. */
export function createTestSockets(elements: readonly StoredElement[]): TestSocketSet | null {
  if (!isTestable(elements)) return null

  const inputs = pinsOf(elements, 'input').map((pin) => ({
    pinId: pin.id,
    bitWidth: pin.bitWidth,
    value: 0,
  }))
  const outputs = pinsOf(elements, 'output').map((pin) => ({
    pinId: pin.id,
    bitWidth: pin.bitWidth,
    value: 0,
  }))

  return { inputs, outputs }
}