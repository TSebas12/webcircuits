/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { loadSettings, saveSettings } from '../../../../src/app/settings'

describe('settings', () => {
  it('defaults', () => {
    localStorage.clear()
    const s = loadSettings()
    expect(s.theme).toBe('auto')
    expect(s.gridVisible).toBe(true)
  })
  it('round-trip', () => {
    const s = loadSettings()
    s.theme = 'dark'
    saveSettings(s)
    expect(loadSettings().theme).toBe('dark')
  })
})