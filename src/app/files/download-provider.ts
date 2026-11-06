/**
 * Proveedor universal: descarga/subida por `<input type="file">` y `<a download>`.
 * Funciona en todos los navegadores (M4-13).
 */

import type { FileHandle, IFileProvider } from './ifile-provider'

export class DownloadProvider implements IFileProvider {
  async open(): Promise<{ name: string; content: string } | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,.CircuitProject,.wccomp,.xml,.txt'
      // Si el usuario cierra el diálogo sin elegir, `change` no salta nunca y la promesa se
      // quedaría colgada para siempre. `cancel` (soportado en navegadores modernos) lo evita.
      const finish = (value: { name: string; content: string } | null): void => {
        input.onchange = null
        input.oncancel = null
        resolve(value)
      }
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) {
          finish(null)
          return
        }
        if (file.size > 50 * 1024 * 1024) {
          finish(null)
          return
        }
        const reader = new FileReader()
        reader.onload = () => finish({ name: file.name, content: String(reader.result ?? '') })
        reader.onerror = () => finish(null)
        reader.readAsText(file)
      }
      input.oncancel = () => finish(null)
      input.click()
    })
  }

  async save(content: string, suggestedName: string, _handle?: FileHandle): Promise<FileHandle | null> {
    // La descarga no recuerda ubicación: siempre es "guardar como".
    return this.saveAs(content, suggestedName)
  }

  async saveAs(content: string, suggestedName: string): Promise<FileHandle | null> {
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = suggestedName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return { name: suggestedName }
  }
}