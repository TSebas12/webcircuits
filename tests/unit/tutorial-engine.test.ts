import { describe, expect, it } from 'vitest'
import { TutorialEngine } from '../../src/app/tutorial/tutorial-engine'

describe('tutorial engine', () => {
  it('navigates steps', () => {
    const engine = new TutorialEngine([
      { id: 'a', title: 'A', body: 'a' },
      { id: 'b', title: 'B', body: 'b' },
    ])
    expect(engine.current()?.id).toBe('a')
    expect(engine.next()).toBe(true)
    expect(engine.current()?.id).toBe('b')
    expect(engine.next()).toBe(false)
    expect(engine.prev()).toBe(true)
    expect(engine.current()?.id).toBe('a')
  })
})