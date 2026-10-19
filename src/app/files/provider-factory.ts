/**
 * Detección de capacidades y fallback (M4-15).
 */
import { DownloadProvider } from './download-provider'
import { FsAccessProvider } from './fs-access-provider'
import type { IFileProvider } from './ifile-provider'

export function createFileProvider(): IFileProvider {
  if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
    return new FsAccessProvider()
  }
  return new DownloadProvider()
}