import { CircuitMap } from '../core/simulate/circuit-map'
import { deserializeProject } from '../core/persist/json'
import { circuitIndex } from '../core/model/symbol'
import type { Id } from '../core/model/types'

interface SimMessage {
  type: 'init' | 'step' | 'reset' | 'setInput' | 'getOutput'
  payload?: unknown
}

interface InitPayload {
  projectJson: string
  circuitId: Id
}

interface StepPayload {
  steps: number
}

interface SetInputPayload {
  pinId: Id
  value: number
}

interface GetOutputPayload {
  pinId: Id
}

let circuitMap: CircuitMap | null = null
let currentState: ReturnType<typeof CircuitMap.prototype.apply> | null = null

function handleInit(payload: InitPayload): void {
  const project = deserializeProject(payload.projectJson)
  const circuit = project.circuit(payload.circuitId)
  if (!circuit) throw new Error('Circuit not found')
  
  const index = circuitIndex(circuit)
  
  circuitMap = CircuitMap.create(index, circuit)
  currentState = circuitMap.apply(0)
  currentState.evaluate(true)
  
  self.postMessage({ type: 'initDone' })
}

function handleStep(payload: StepPayload): void {
  if (!circuitMap || !currentState) return
  
  for (let i = 0; i < payload.steps; i++) {
    if (!currentState.evaluate(true)) {
      self.postMessage({ type: 'oscillation', step: i })
      return
    }
  }
  
  self.postMessage({ type: 'stepDone', steps: payload.steps })
}

function handleSetInput(payload: SetInputPayload): void {
  if (!circuitMap || !currentState) return
  
  // Find the input pin symbol and set its value
  // This is a simplified implementation
  self.postMessage({ type: 'inputSet', pinId: payload.pinId })
}

function handleGetOutput(payload: GetOutputPayload): void {
  if (!circuitMap || !currentState) return
  
  // Get output value
  self.postMessage({ type: 'outputValue', pinId: payload.pinId, value: 0 })
}

function handleReset(): void {
  if (!circuitMap) return
  currentState = circuitMap.apply(0)
  currentState.evaluate(true)
  self.postMessage({ type: 'resetDone' })
}

self.onmessage = (ev: MessageEvent<SimMessage>) => {
  const { type, payload } = ev.data
  
  try {
    switch (type) {
      case 'init':
        handleInit(payload as InitPayload)
        break
      case 'step':
        handleStep(payload as StepPayload)
        break
      case 'reset':
        handleReset()
        break
      case 'setInput':
        handleSetInput(payload as SetInputPayload)
        break
      case 'getOutput':
        handleGetOutput(payload as GetOutputPayload)
        break
      default:
        console.warn('Unknown message type:', type)
    }
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      error: error instanceof Error ? error.message : String(error) 
    })
  }
}

export {}