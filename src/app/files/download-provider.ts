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
      input.accept = '.json,.CircuitProject,.xml,.txt'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) {
          resolve(null)
          return
        }
        const reader = new FileReader()
        reader.onload = () => resolve({ name: file.name, content: String(reader.result ?? '') })
        reader.onerror = () => resolve(null)
        reader.readAsText(file)
      }
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