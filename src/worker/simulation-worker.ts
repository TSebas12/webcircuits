// Esqueleto para M12-06: simulación en Worker (por portar CircuitMap aquí).
self.onmessage = (ev: MessageEvent) => {
  self.postMessage({ type: 'ready', data: ev.data })
}
export {}
