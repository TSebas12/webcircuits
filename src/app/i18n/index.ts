type Catalog = Record<string, string>

const es: Catalog = {
  'app.title': 'WebCircuits',
  'editor.exportPng': 'Exportar PNG',
  'editor.exportSvg': 'Exportar SVG',
  'script.title': 'Script Python',
  'script.run': 'Ejecutar',
  'common.close': 'Cerrar',
  'cmd.exportPng': 'Exportar PNG',
  'cmd.exportSvg': 'Exportar SVG',
  'cmd.groupBus': 'Agrupar cables en bus',
  'cmd.ungroupBus': 'Desagrupar bus',
  'cmd.rotate': 'Rotar selección',
  'cmd.duplicate': 'Duplicar',
  'cmd.delete': 'Borrar selección',
  'cmd.paste': 'Pegar',
  'cmd.zoomFit': 'Zoom to fit',
  'cmd.clear': 'Vaciar lienzo',
  'cmd.togglePower': 'Encender/apagar corriente',
  'cmd.print': 'Imprimir',
}

const en: Catalog = {
  'app.title': 'WebCircuits',
  'editor.exportPng': 'Export PNG',
  'editor.exportSvg': 'Export SVG',
  'script.title': 'Python Script',
  'script.run': 'Run',
  'common.close': 'Close',
  'cmd.exportPng': 'Export PNG',
  'cmd.exportSvg': 'Export SVG',
  'cmd.groupBus': 'Group wires into bus',
  'cmd.ungroupBus': 'Ungroup bus',
  'cmd.rotate': 'Rotate selection',
  'cmd.duplicate': 'Duplicate',
  'cmd.delete': 'Delete selection',
  'cmd.paste': 'Paste',
  'cmd.zoomFit': 'Zoom to fit',
  'cmd.clear': 'Clear canvas',
  'cmd.togglePower': 'Toggle power',
  'cmd.print': 'Print',
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