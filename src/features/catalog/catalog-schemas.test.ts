import { describe, expect, it } from 'vitest'
import { inventoryItemFormSchema, productFormSchema, recipeFormSchema } from './catalog-schemas'

describe('productFormSchema', () => {
  it('accepts a valid product', () => {
    const result = productFormSchema.safeParse({
      name: 'Mojito',
      description: '',
      categoryId: '',
      kind: 'preparado',
      price: 120,
      isAlcoholic: true,
      servingSizeMl: 1000,
      active: true,
      notes: '',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a short name', () => {
    const result = productFormSchema.safeParse({
      name: 'A',
      description: '',
      categoryId: '',
      kind: 'preparado',
      price: 120,
      isAlcoholic: true,
      servingSizeMl: 1000,
      active: true,
      notes: '',
    })

    expect(result.success).toBe(false)
  })

  it('rejects a negative price', () => {
    const result = productFormSchema.safeParse({
      name: 'Mojito',
      description: '',
      categoryId: '',
      kind: 'preparado',
      price: -1,
      isAlcoholic: true,
      servingSizeMl: 1000,
      active: true,
      notes: '',
    })

    expect(result.success).toBe(false)
  })
})

describe('inventoryItemFormSchema', () => {
  it('accepts a valid inventory item', () => {
    const result = inventoryItemFormSchema.safeParse({
      name: 'Ron blanco',
      categoryId: '',
      kind: 'ingrediente',
      baseUnit: 'ml',
      purchaseUnit: 'botella',
      purchaseFactor: 750,
      avgCost: 0.1,
      minStockBase: 0,
      trackStock: true,
      active: true,
    })

    expect(result.success).toBe(true)
  })

  it('rejects a zero purchase factor', () => {
    const result = inventoryItemFormSchema.safeParse({
      name: 'Ron blanco',
      categoryId: '',
      kind: 'ingrediente',
      baseUnit: 'ml',
      purchaseUnit: 'botella',
      purchaseFactor: 0,
      avgCost: 0.1,
      minStockBase: 0,
      trackStock: true,
      active: true,
    })

    expect(result.success).toBe(false)
  })
})

describe('recipeFormSchema', () => {
  it('accepts a valid recipe', () => {
    const result = recipeFormSchema.safeParse({
      yieldQty: 1,
      yieldUnit: 'porcion',
      notes: '',
      items: [
        {
          inventory_item_id: '11111111-1111-4111-8111-111111111111',
          qty_base: 100,
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('rejects a recipe without items', () => {
    const result = recipeFormSchema.safeParse({
      yieldQty: 1,
      yieldUnit: 'porcion',
      notes: '',
      items: [],
    })

    expect(result.success).toBe(false)
  })

  it('rejects a zero quantity', () => {
    const result = recipeFormSchema.safeParse({
      yieldQty: 1,
      yieldUnit: 'porcion',
      notes: '',
      items: [
        {
          inventory_item_id: '11111111-1111-4111-8111-111111111111',
          qty_base: 0,
        },
      ],
    })

    expect(result.success).toBe(false)
  })
})
