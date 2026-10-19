/**
 * Proveedor File System Access API (M4-14).
 *
 * "Abrir…" y "Guardar como…" reales, con handle para re-guardar sin diálogo.
 * Solo funciona en Chromium; el resto usa el proveedor de descarga.
 */

import type { FileHandle, IFileProvider } from './ifile-provider'

interface FsHandle extends FileHandle {
  readonly native: FileSystemFileHandle
}

export class FsAccessProvider implements IFileProvider {
  private static supported(): boolean {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window
  }

  async open(): Promise<{ name: string; content: string } | null> {
    if (!FsAccessProvider.supported()) return null
    try {
      const [handle] = await (window as unknown as { showOpenFilePicker: (o?: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker({
        types: [{ description: 'WebCircuits', accept: { 'application/json': ['.json', '.CircuitProject'] } }],
      })
      if (!handle) return null
      const file = await handle.getFile()
      const content = await file.text()
      return { name: file.name, content }
    } catch {
      return null
    }
  }

  async save(content: string, suggestedName: string, handle?: FileHandle): Promise<FileHandle | null> {
    if (!FsAccessProvider.supported()) return null
    const nativeHandle = (handle as FsHandle | undefined)?.native
    if (nativeHandle) {
      try {
        const writable = await nativeHandle.createWritable()
        await writable.write(content)
        await writable.close()
        return handle ? ({ name: handle.name } as FileHandle) : null
      } catch {
        // cae a saveAs
      }
    }
    return this.saveAs(content, suggestedName)
  }

  async saveAs(content: string, suggestedName: string): Promise<FileHandle | null> {
    if (!FsAccessProvider.supported()) return null
    try {
      const handle = await (window as unknown as { showSaveFilePicker: (o?: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
        suggestedName,
        types: [{ description: 'WebCircuits', accept: { 'application/json': ['.json', '.CircuitProject'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return { name: handle.name, native: handle } as FsHandle
    } catch {
      return null
    }
  }
}