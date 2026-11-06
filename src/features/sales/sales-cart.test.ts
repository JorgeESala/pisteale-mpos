import { describe, expect, it } from 'vitest'
import {
  addSaleLine,
  canSellPremium,
  saleLineTotal,
  saleSubtotal,
  saleUnitPrice,
} from './sales-cart'
import type { SaleProduct } from '@/types/database'

const drink: SaleProduct = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Mojito',
  price: 120,
  premium_price: 150,
  is_alcoholic: true,
}

describe('sales cart', () => {
  it('uses normal and premium prices', () => {
    expect(saleUnitPrice(drink, 'normal')).toBe(120)
    expect(saleUnitPrice(drink, 'premium')).toBe(150)
    expect(canSellPremium(drink)).toBe(true)
  })

  it('adds and combines lines with the same product and tier', () => {
    const once = addSaleLine([], drink, 'premium', 1)
    const twice = addSaleLine(once, drink, 'premium', 2)

    expect(twice).toHaveLength(1)
    expect(twice[0].qty).toBe(3)
  })

  it('calculates line and cart totals', () => {
    const lines = addSaleLine([], drink, 'normal', 2)

    expect(saleLineTotal(lines[0])).toBe(240)
    expect(saleSubtotal(lines)).toBe(240)
  })

  it('does not allow premium without a premium price', () => {
    const nonAlcoholic: SaleProduct = {
      ...drink,
      is_alcoholic: false,
      premium_price: null,
    }

    expect(canSellPremium(nonAlcoholic)).toBe(false)
    expect(saleUnitPrice(nonAlcoholic, 'premium')).toBe(120)
  })
})
