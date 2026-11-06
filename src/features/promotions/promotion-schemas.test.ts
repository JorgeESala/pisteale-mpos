import { describe, expect, it } from 'vitest'
import { promotionFormSchema } from './promotion-schemas'

const categoryId = '11111111-1111-4111-8111-111111111111'

describe('promotionFormSchema', () => {
  it('accepts a valid promotion', () => {
    const result = promotionFormSchema.safeParse({
      name: '2 x $180',
      bundleQty: 2,
      fixedPrice: 180,
      appliesTo: 'alcoholic',
      appliesToTier: 'normal',
      includeCategoryIds: [],
      excludeCategoryIds: [categoryId],
      automatic: true,
      active: true,
      sortOrder: 10,
    })

    expect(result.success).toBe(true)
  })

  it('rejects overlapping include and exclude categories', () => {
    const result = promotionFormSchema.safeParse({
      name: 'Promo',
      bundleQty: 2,
      fixedPrice: 150,
      appliesTo: 'any',
      appliesToTier: 'any',
      includeCategoryIds: [categoryId],
      excludeCategoryIds: [categoryId],
      automatic: false,
      active: true,
      sortOrder: 0,
    })

    expect(result.success).toBe(false)
  })

  it('rejects zero bundle quantity', () => {
    const result = promotionFormSchema.safeParse({
      name: 'Promo',
      bundleQty: 0,
      fixedPrice: 150,
      appliesTo: 'any',
      appliesToTier: 'any',
      includeCategoryIds: [],
      excludeCategoryIds: [],
      automatic: false,
      active: true,
      sortOrder: 0,
    })

    expect(result.success).toBe(false)
  })
})
