/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { getRecents, addRecent, clearRecents } from '../../../../src/app/files/recents'

describe('recents', () => {
  beforeEach(() => clearRecents())
  it('add and list', () => {
    addRecent('a.json')
    addRecent('b.json')
    expect(getRecents()).toEqual(['b.json', 'a.json'])
  })
  it('dedup', () => {
    addRecent('a.json')
    addRecent('a.json')
    expect(getRecents()).toEqual(['a.json'])
  })
})