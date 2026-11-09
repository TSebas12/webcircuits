import type { PythonRunResult } from '../../core/python/protocol'
import { PythonRunner, type WorkerFactory } from './runner'
import type { PythonComponentSpec } from '../../core/python/component-bridge'
import { validateComponentSpec } from '../../core/python/component-bridge'


export interface ComponentRunOptions {
  readonly inputs: readonly number[]
  readonly spec: PythonComponentSpec
  readonly timeoutMs?: number
}

/**
 * Builds a Python snippet that enforces the component contract.
 * The user-provided body must define `compute(inputs)`.
 */
export function buildComponentCode(userCode: string, spec: PythonComponentSpec): string {
  const inputs = `[${Array(spec.inputCount).fill('0').join(', ')}]`
  return `${userCode}

_inputs = ${inputs}
_result = compute(_inputs)
if not (isinstance(_result, (list, tuple)) and len(_result) == ${spec.outputCount}):
    raise ValueError('salida invalida')
print(_result)
`
}

export class ComponentRunner {
  private readonly runner: PythonRunner
  constructor(factory: WorkerFactory) {
    this.runner = new PythonRunner(factory)
  }

  run(userCode: string, options: ComponentRunOptions): Promise<PythonRunResult> {
    const spec = validateComponentSpec(options.spec)
    if (!spec) {
      return Promise.resolve({ id: '', ok: false, stdout: '', error: 'spec invalida' })
    }
    const code = buildComponentCode(userCode, spec)
    return this.runner.run(code, { timeoutMs: options.timeoutMs ?? 5_000 })
  }
}