import { describe, expect, it } from 'vitest'
import { allowedRecipeUnits, ML_PER_OZ, recipeQuantityToBase } from './recipe-units'

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
})
