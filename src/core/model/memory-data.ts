/**
 * Ayudas para los bytes de una memoria (RAM/ROM).
 *
 * Portado de `Memory.BytesPerCellFor`, `Memory.NumberCellsFor`, `Memory.CellValue`,
 * `Memory.SetCellValue`, `Memory.MemoryValue` y `Memory.SetMemoryValue`.
 *
 * La codificación base64 es la del fichero original (XML y JSON). Se implementa aquí
 * de forma pura para no depender de `Buffer`/`atob` del entorno.
 */
export function bytesPerCell(dataBitWidth: number): number {
  const width = Math.max(1, Math.trunc(dataBitWidth))
  return Math.floor(width / 8) + (width % 8 === 0 ? 0 : 1)
}

export function numberCells(addressBitWidth: number): number {
  return 1 << Math.max(1, Math.trunc(addressBitWidth))
}

export function cellValue(data: Uint8Array, dataBitWidth: number, index: number): number {
  const size = bytesPerCell(dataBitWidth)
  const start = index * size
  let value = 0
  for (let i = 0; i < size; i++) {
    value |= (data[start + i] ?? 0) << (i * 8)
  }
  return value & ((1 << Math.min(32, dataBitWidth)) - 1)
}

export function setCellValue(data: Uint8Array, dataBitWidth: number, index: number, value: number): void {
  const size = bytesPerCell(dataBitWidth)
  const start = index * size
  const mask = dataBitWidth >= 32 ? 0xffffffff : (1 << dataBitWidth) - 1
  const v = value & mask
  for (let i = 0; i < size; i++) {
    data[start + i] = (v >> (i * 8)) & 0xff
  }
}

export function memoryValue(dataString: string | undefined, addressBitWidth: number, dataBitWidth: number): Uint8Array {
  const size = bytesPerCell(dataBitWidth) * numberCells(addressBitWidth)
  const out = new Uint8Array(size)
  if (dataString) {
    try {
      const decoded = decodeBase64(dataString)
      const n = Math.min(size, decoded.length)
      for (let i = 0; i < n; i++) out[i] = decoded[i]!
    } catch {
      // Datos inválidos: memoria vacía.
    }
  }
  return out
}

export function encodeMemoryValue(data: Uint8Array): string {
  // Recorta los ceros finales, como el original.
  let last = data.length - 1
  while (last >= 0 && data[last] === 0) last--
  if (last < 0) return ''
  return encodeBase64(data.slice(0, last + 1))
}

function decodeBase64(input: string): Uint8Array {
  const binary = atob(input)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function encodeBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]!)
  return btoa(binary)
}