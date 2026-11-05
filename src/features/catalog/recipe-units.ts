import type { BaseUnit, RecipeInputUnit } from '@/types/database'

export const ML_PER_OZ = 30

export function allowedRecipeUnits(baseUnit: BaseUnit): RecipeInputUnit[] {
  if (baseUnit === 'ml') return ['ml', 'oz']
  if (baseUnit === 'g') return ['g']
  return ['pza']
}

export function recipeQuantityToBase(qty: number, unit: RecipeInputUnit): number {
  if (unit === 'oz') return Math.round(qty * ML_PER_OZ)
  return Math.round(qty)
}

export function calculateIceGrams(servingSizeMl: number, liquidMl: number, density = 0.9): number {
  return Math.round(Math.max(0, servingSizeMl - liquidMl) * density)
}
