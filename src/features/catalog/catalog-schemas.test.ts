import { describe, expect, it } from 'vitest'
import {
  defaultConsumablesFormSchema,
  iceDailyRecordFormSchema,
  inventoryGroupFormSchema,
  inventoryItemFormSchema,
  productFormSchema,
  recipeFormSchema,
} from './catalog-schemas'

const validProduct = {
  name: 'Mojito',
  description: '',
  categoryId: '',
  kind: 'preparado' as const,
  price: 120,
  premiumPrice: 150,
  isAlcoholic: true,
  servingSizeMl: 1000,
  active: true,
  notes: '',
}

describe('productFormSchema', () => {
  it('accepts a valid product', () => {
    expect(productFormSchema.safeParse(validProduct).success).toBe(true)
  })

  it('rejects an alcoholic product without premium price', () => {
    const result = productFormSchema.safeParse({
      ...validProduct,
      premiumPrice: null,
    })

    expect(result.success).toBe(false)
  })

  it('rejects a negative price', () => {
    const result = productFormSchema.safeParse({
      ...validProduct,
      price: -1,
    })

    expect(result.success).toBe(false)
  })
})

describe('inventoryGroupFormSchema', () => {
  it('accepts a valid group', () => {
    const result = inventoryGroupFormSchema.safeParse({
      name: 'Ron blanco',
      categoryId: '',
      baseUnit: 'ml',
      isTiered: true,
      referenceCost: null,
      active: true,
    })

    expect(result.success).toBe(true)
  })

  it('rejects a short name', () => {
    const result = inventoryGroupFormSchema.safeParse({
      name: 'R',
      categoryId: '',
      baseUnit: 'ml',
      isTiered: true,
      referenceCost: null,
      active: true,
    })

    expect(result.success).toBe(false)
  })
})

describe('inventoryItemFormSchema', () => {
  it('accepts a valid inventory item', () => {
    const result = inventoryItemFormSchema.safeParse({
      name: 'Bacardí Blanco 750',
      groupId: '11111111-1111-4111-8111-111111111111',
      tier: 'estandar',
      kind: 'ingrediente',
      purchaseUnit: 'botella',
      purchaseFactor: 750,
      avgCost: 0.4,
      minStockBase: 0,
      trackStock: true,
      active: true,
    })

    expect(result.success).toBe(true)
  })

  it('rejects a zero purchase factor', () => {
    const result = inventoryItemFormSchema.safeParse({
      name: 'Bacardí Blanco 750',
      groupId: '11111111-1111-4111-8111-111111111111',
      tier: 'estandar',
      kind: 'ingrediente',
      purchaseUnit: 'botella',
      purchaseFactor: 0,
      avgCost: 0.4,
      minStockBase: 0,
      trackStock: true,
      active: true,
    })

    expect(result.success).toBe(false)
  })
})

describe('recipeFormSchema', () => {
  it('accepts a recipe with ounces', () => {
    const result = recipeFormSchema.safeParse({
      yieldQty: 1,
      yieldUnit: 'porcion',
      notes: '',
      items: [
        {
          inventory_group_id: '11111111-1111-4111-8111-111111111111',
          tier_rule: 'match',
          qty: 1.5,
          unit: 'oz',
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
          inventory_group_id: '11111111-1111-4111-8111-111111111111',
          tier_rule: 'match',
          qty: 0,
          unit: 'oz',
        },
      ],
    })

    expect(result.success).toBe(false)
  })
})

describe('defaultConsumablesFormSchema', () => {
  it('accepts a valid configuration', () => {
    const result = defaultConsumablesFormSchema.safeParse({
      iceGroupId: '11111111-1111-4111-8111-111111111111',
      cupGroupId: '22222222-2222-4222-8222-222222222222',
      lidGroupId: '33333333-3333-4333-8333-333333333333',
      strawGroupId: '44444444-4444-4444-8444-444444444444',
      cupQty: 1,
      lidQty: 1,
      strawQty: 1,
      iceDensity: 0.9,
      iceActive: true,
      cupActive: true,
      lidActive: true,
      strawActive: true,
    })

    expect(result.success).toBe(true)
  })

  it('rejects a zero density', () => {
    const result = defaultConsumablesFormSchema.safeParse({
      iceGroupId: '11111111-1111-4111-8111-111111111111',
      cupGroupId: '22222222-2222-4222-8222-222222222222',
      lidGroupId: '33333333-3333-4333-8333-333333333333',
      strawGroupId: '44444444-4444-4444-8444-444444444444',
      cupQty: 1,
      lidQty: 1,
      strawQty: 1,
      iceDensity: 0,
      iceActive: true,
      cupActive: true,
      lidActive: true,
      strawActive: true,
    })

    expect(result.success).toBe(false)
  })
})

describe('iceDailyRecordFormSchema', () => {
  it('accepts a valid daily ice record', () => {
    const result = iceDailyRecordFormSchema.safeParse({
      recordDate: '2026-11-05',
      bags: 2,
      totalCost: 100,
      drinksSold: 14,
      notes: '',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a record without drinks sold', () => {
    const result = iceDailyRecordFormSchema.safeParse({
      recordDate: '2026-11-05',
      bags: null,
      totalCost: 100,
      drinksSold: 0,
      notes: '',
    })

    expect(result.success).toBe(false)
  })
})
