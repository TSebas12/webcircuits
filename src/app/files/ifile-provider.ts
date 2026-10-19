/**
 * Capa de archivos web (M4-12).
 *
 * La app **solo** habla con esta interfaz: así el proveedor concreto (descarga,
 * File System Access, IndexedDB) se puede cambiar sin tocar el resto.
 */

export interface FileHandle {
  readonly name: string
}

export interface IFileProvider {
  /** Abre un fichero y devuelve su contenido como texto. */
  open(): Promise<{ name: string; content: string } | null>
  /** Guarda el contenido. Si hay handle previo, reutilízalo; si no, pide ubicación. */
  save(content: string, suggestedName: string, handle?: FileHandle): Promise<FileHandle | null>
  /** Guarda con un nuevo nombre/ubicación (siempre pide). */
  saveAs(content: string, suggestedName: string): Promise<FileHandle | null>
}