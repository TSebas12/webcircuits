import { describe, expect, it } from 'vitest'
import { availableLocales, setLocale, t } from '../../src/app/i18n'

describe('i18n', () => {
  it('translates known keys', () => {
    expect(t('app.title')).toBe('WebCircuits')
  })
  it('falls back to key', () => {
    expect(t('nope')).toBe('nope')
  })
  it('ignores unknown locale', () => {
    setLocale('xx')
    expect(t('app.title')).toBe('WebCircuits')
  })
  it('lists available locales', () => {
    expect(availableLocales()).toContain('es')
    expect(availableLocales()).toContain('en')
  })
  it('translates export png in english', () => {
    setLocale('en')
    expect(t('editor.exportPng')).toBe('Export PNG')
    setLocale('es')
  })
})