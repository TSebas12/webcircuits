/**
 * Ayudante para parsear enumeraciones a partir de texto, como hace el original.
 *
 * En C# `EnumHelper.Parse<T>` y `EnumHelper.IsValid<T>` se apoyan en la reflexión
 * sobre el tipo `T`. En TypeScript no hay reflexión sobre tipos, así que se le
 * pasa el objeto del enum (que en un enum numérico contiene tanto los nombres
 * como los valores, y los valores con nombre se recuperan en ambas direcciones).
 *
 * Portado de `LogicCircuit/EnumHelper.cs`.
 */

type EnumObject = Record<string, string | number>

function enumNames(enumObj: EnumObject): string[] {
  return Object.keys(enumObj).filter((key) => Number.isNaN(Number(key)))
}

function enumToString(value: number, names: string[], enumObj: EnumObject): string {
  const single = names.find((name) => enumObj[name] === value)
  if (single !== undefined) {
    return single
  }
  // Enumeración con flags: se descompone en los miembros definidos que lo cubren.
  const flags = names.filter((name) => {
    const v = enumObj[name]
    return typeof v === 'number' && v !== 0 && (value & v) === v
  })
  let combined = 0
  for (const name of flags) {
    combined |= enumObj[name] as number
  }
  if (flags.length > 0 && combined === value) {
    return flags.join(', ')
  }
  return String(value)
}

function parseOne(text: string, names: string[], enumObj: EnumObject): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '') {
    return undefined
  }
  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed)
  }
  const match = names.find((name) => name.toLowerCase() === trimmed.toLowerCase())
  if (match !== undefined && typeof enumObj[match] === 'number') {
    return enumObj[match] as number
  }
  return undefined
}

function tryParse(text: string, names: string[], enumObj: EnumObject): number | undefined {
  const parts = text.trim().split(/[,\s]+/).filter((part) => part !== '')
  if (parts.length === 0) {
    return undefined
  }
  if (parts.length === 1) {
    const first = parts[0]
    if (first === undefined) {
      return undefined
    }
    return parseOne(first, names, enumObj)
  }
  let combined = 0
  for (const part of parts) {
    const value = parseOne(part, names, enumObj)
    if (value === undefined) {
      return undefined
    }
    combined |= value
  }
  return combined
}

export const EnumHelper = {
  parse<T extends number>(
    text: string | null | undefined,
    defaultValue: T,
    enumObj: EnumObject,
  ): T {
    const names = enumNames(enumObj)
    if (text == null || text.trim() === '') {
      return defaultValue
    }
    const value = tryParse(text, names, enumObj)
    if (value === undefined) {
      return defaultValue
    }
    if (!this.isValid(value, enumObj)) {
      return defaultValue
    }
    return value as T
  },

  isValid(value: number, enumObj: EnumObject): boolean {
    const names = enumNames(enumObj)
    const text = enumToString(value, names, enumObj)
    if (names.some((name) => name.toLowerCase() === text.toLowerCase())) {
      return true
    }
    const parts = text.split(/[,\s]+/).filter((part) => part !== '')
    return parts.length > 0 && parts.every((part) =>
      names.some((name) => name.toLowerCase() === part.toLowerCase()),
    )
  },
}