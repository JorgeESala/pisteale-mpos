import { describe, expect, it } from 'vitest'
import {
  allowedRecipeUnits,
  calculateIceGrams,
  ML_PER_OZ,
  recipeQuantityToBase,
} from './recipe-units'

describe('recipe units', () => {
  it('uses 30 ml per ounce', () => {
    expect(ML_PER_OZ).toBe(30)
  })

  it('converts ounces to ml', () => {
    expect(recipeQuantityToBase(1.5, 'oz')).toBe(45)
    expect(recipeQuantityToBase(2, 'oz')).toBe(60)
  })

  it('keeps ml, g and pza as base units', () => {
    expect(recipeQuantityToBase(250, 'ml')).toBe(250)
    expect(recipeQuantityToBase(5, 'g')).toBe(5)
    expect(recipeQuantityToBase(1, 'pza')).toBe(1)
  })

  it('limits units by base unit', () => {
    expect(allowedRecipeUnits('ml')).toEqual(['ml', 'oz'])
    expect(allowedRecipeUnits('g')).toEqual(['g'])
    expect(allowedRecipeUnits('pza')).toEqual(['pza'])
  })

  it('calculates ice from the remaining cup volume', () => {
    expect(calculateIceGrams(940, 600)).toBe(306)
    expect(calculateIceGrams(940, 500)).toBe(396)
  })

  it('returns zero ice when the liquid fills the cup', () => {
    expect(calculateIceGrams(940, 940)).toBe(0)
    expect(calculateIceGrams(940, 1000)).toBe(0)
  })
})
