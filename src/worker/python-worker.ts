import { validateRequest } from '../core/python/protocol'

// Lazy-loaded runtime holder.
let pyodide: unknown = null

async function ensurePyodide(): Promise<unknown> {
  if (pyodide) return pyodide
  const g = globalThis as Record<string, unknown>
  if (typeof g.loadPyodide !== 'function') {
    // @ts-expect-error remote module
    await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs')
  }
  const load = g.loadPyodide as (opts: Record<string, unknown>) => Promise<unknown>
  pyodide = await load({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' })
  return pyodide
}

async function run(req: unknown) {
  const validated = validateRequest(req)
  if (!validated) {
    return { ok: false, error: 'invalid request' }
  }
  try {
    const rt = await ensurePyodide() as { runPython: (code: string) => unknown }
    rt.runPython(`
import sys, io
_stdout = io.StringIO()
sys.stdout = _stdout
`)
    const result = rt.runPython(validated.code)
    const stdout = rt.runPython('sys.stdout.getvalue()')
    return { id: validated.id, ok: true, stdout: String(stdout ?? ''), returnValue: result }
  } catch (e) {
    return { id: validated.id, ok: false, stdout: '', error: String(e) }
  }
}

self.onmessage = async (ev: MessageEvent) => {
  const result = await run(ev.data)
  self.postMessage(result)
}
export {}