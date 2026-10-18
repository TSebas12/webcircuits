import { describe, expect, it } from 'vitest'
import { EnumHelper } from '../../../src/core/enum-helper'

enum Num1 {
  Zero,
  One,
  Two,
  Three,
}

enum Num2 {
  Zero = 0,
  One = 1,
  Two = 2,
  Three = 4,
}

describe('EnumHelper (port de EnumHelperTest.cs)', () => {
  it('parsea un enum simple', () => {
    expect(EnumHelper.parse('Zero', Num1.Zero, Num1)).toBe(Num1.Zero)
    expect(EnumHelper.parse('One', Num1.Zero, Num1)).toBe(Num1.One)
    expect(EnumHelper.parse('Two', Num1.Zero, Num1)).toBe(Num1.Two)
    expect(EnumHelper.parse('Three', Num1.Zero, Num1)).toBe(Num1.Three)

    expect(EnumHelper.parse('ZERO', Num1.Zero, Num1)).toBe(Num1.Zero)
    expect(EnumHelper.parse('one', Num1.Zero, Num1)).toBe(Num1.One)
    expect(EnumHelper.parse('tWO', Num1.Zero, Num1)).toBe(Num1.Two)
    expect(EnumHelper.parse('tHReE', Num1.Zero, Num1)).toBe(Num1.Three)

    expect(EnumHelper.parse('hello', 100 as Num1, Num1)).toBe(100 as Num1)
    expect(EnumHelper.parse('Two', 100 as Num1, Num1)).toBe(Num1.Two)
    expect(EnumHelper.parse('world', Num1.One, Num1)).toBe(Num1.One)

    expect(EnumHelper.parse('2', Num1.Three, Num1)).toBe(Num1.Two)
    expect(EnumHelper.parse('100', Num1.Three, Num1)).toBe(Num1.Three)
    expect(EnumHelper.parse('7', Num1.Three, Num1)).toBe(Num1.Three)
  })

  it('parsea un enum con flags', () => {
    expect(EnumHelper.parse('Zero', Num2.Zero, Num2)).toBe(Num2.Zero)
    expect(EnumHelper.parse('One', Num2.Zero, Num2)).toBe(Num2.One)
    expect(EnumHelper.parse('Two', Num2.Zero, Num2)).toBe(Num2.Two)
    expect(EnumHelper.parse('Three', Num2.Zero, Num2)).toBe(Num2.Three)

    expect(EnumHelper.parse('one, two', Num2.Three, Num2)).toBe(Num2.One | Num2.Two)
    expect(EnumHelper.parse('two, one', Num2.Three, Num2)).toBe(Num2.One | Num2.Two)
    expect(EnumHelper.parse('3', Num2.Three, Num2)).toBe(Num2.One | Num2.Two)

    expect(EnumHelper.parse('7', Num2.Zero, Num2)).toBe(Num2.One | Num2.Two | Num2.Three)
  })

  it('isValid distingue valores definidos de los que no', () => {
    expect(EnumHelper.isValid(Num1.Zero, Num1)).toBe(true)
    expect(EnumHelper.isValid(Num1.Three, Num1)).toBe(true)
    expect(EnumHelper.isValid(100 as Num1, Num1)).toBe(false)
    expect(EnumHelper.isValid(7 as Num1, Num1)).toBe(false)
  })
})