type Catalog = Record<string, string>

const es: Catalog = {
  'app.title': 'WebCircuits',
  'editor.exportPng': 'Exportar PNG',
}

const catalogs: Record<string, Catalog> = { es }

let current = 'es'

export function setLocale(locale: string): void {
  if (catalogs[locale]) current = locale
}

export function t(key: string): string {
  return catalogs[current]?.[key] ?? key
}