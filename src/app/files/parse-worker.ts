// Worker para parsear ficheros grandes (M4-23).
self.onmessage = (e: MessageEvent<{ id: number; text: string; kind: 'json' | 'xml' }>) => {
  const { id, text, kind } = e.data
  try {
    if (kind === 'json') {
      const parsed = JSON.parse(text)
      self.postMessage({ id, ok: true, result: parsed })
    } else {
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'application/xml')
      self.postMessage({ id, ok: true, result: doc.documentElement.outerHTML })
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}