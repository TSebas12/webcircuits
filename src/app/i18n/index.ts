type Catalog = Record<string, string>

const es: Catalog = {
  'app.title': 'WebCircuits',
  'editor.exportPng': 'Exportar PNG',
}

const en: Catalog = {
  'app.title': 'WebCircuits',
  'editor.exportPng': 'Export PNG',
}

const catalogs: Record<string, Catalog> = { es, en }

let current = detectLocale()

function detectLocale(): string {
  const lang =
    typeof navigator !== 'undefined' && navigator.language
      ? navigator.language.split('-')[0] ?? 'es'
      : 'es'
  return catalogs[lang] ? lang : 'es'
}

export function setLocale(locale: string): void {
  if (catalogs[locale]) current = locale
}

export function availableLocales(): string[] {
  return Object.keys(catalogs)
}

export function t(key: string): string {
  return catalogs[current]?.[key] ?? key
}