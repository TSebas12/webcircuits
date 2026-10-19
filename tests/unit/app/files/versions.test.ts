/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { listVersions, saveVersion, deleteVersion } from '../../../../src/app/files/versions'

describe('versions', () => {
  beforeEach(() => localStorage.clear())
  it('save and list', () => {
    const v = saveVersion('v1', '{}')
    expect(listVersions()).toHaveLength(1)
    expect(listVersions()[0]!.id).toBe(v.id)
  })
  it('delete', () => {
    const v = saveVersion('v1', '{}')
    deleteVersion(v.id)
    expect(listVersions()).toHaveLength(0)
  })
})