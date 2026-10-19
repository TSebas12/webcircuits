/** Utilidad para parsear ficheros grandes en un Worker (M4-23). */
export async function parseInWorker(text: string, kind: 'json' | 'xml'): Promise<unknown> {
  if (text.length < 200_000) {
    // Ficheros pequeños: parsear en el hilo principal.
    if (kind === 'json') return JSON.parse(text)
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    return doc
  }
  const worker = new Worker(new URL('./parse-worker.ts', import.meta.url), { type: 'module' })
  return new Promise((resolve, reject) => {
    const id = Math.random()
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.id !== id) return
      worker.terminate()
      if (e.data.ok) resolve(e.data.result)
      else reject(new Error(e.data.error))
    }
    worker.postMessage({ id, text, kind })
  })
}