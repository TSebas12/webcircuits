import { describe, expect, it } from 'vitest'
import { setLocale, t } from '../../src/app/i18n'

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
})