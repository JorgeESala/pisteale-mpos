import { describe, expect, it } from 'vitest'
import {
  calculateEventSaleTotals,
  eventSaleLineTotal,
  type EventSaleLineInput,
} from './event-pricing'

const promotion = { enabled: true, bundleQty: 2, bundlePrice: 180 }

function line(quantity: number, unitPrice: number, eligible = true): EventSaleLineInput {
  return {
    productId: null,
    productName: 'Bebida',
    quantity,
    unitPrice,
    promotionEligible: eligible,
  }
}

describe('event sale pricing', () => {
  it('applies two for 180 with a leftover at full price', () => {
    expect(calculateEventSaleTotals([line(3, 100)], promotion)).toEqual({
      grossTotal: 300,
      discountTotal: 20,
      total: 280,
      limitExceeded: false,
    })
  })

  it('does not discount when the pair already costs less than the bundle', () => {
    expect(calculateEventSaleTotals([line(2, 90)], promotion)).toEqual({
      grossTotal: 180,
      discountTotal: 0,
      total: 180,
      limitExceeded: false,
    })
  })

  it('pairs the most expensive drinks first', () => {
    expect(calculateEventSaleTotals([line(2, 100), line(1, 200)], promotion)).toEqual({
      grossTotal: 400,
      discountTotal: 120,
      total: 280,
      limitExceeded: false,
    })
  })

  it('leaves ineligible lines at full price', () => {
    expect(calculateEventSaleTotals([line(1, 500, false), line(2, 100)], promotion)).toEqual({
      grossTotal: 700,
      discountTotal: 20,
      total: 680,
      limitExceeded: false,
    })
  })

  it('charges full price when the promotion is disabled', () => {
    expect(calculateEventSaleTotals([line(3, 100)], { ...promotion, enabled: false })).toEqual({
      grossTotal: 300,
      discountTotal: 0,
      total: 300,
      limitExceeded: false,
    })
  })

  it('handles multiple bundles and one leftover', () => {
    expect(calculateEventSaleTotals([line(5, 100)], promotion)).toEqual({
      grossTotal: 500,
      discountTotal: 40,
      total: 460,
      limitExceeded: false,
    })
  })

  it('supports a different bundle size', () => {
    expect(
      calculateEventSaleTotals([line(3, 100)], {
        enabled: true,
        bundleQty: 3,
        bundlePrice: 250,
      }),
    ).toEqual({
      grossTotal: 300,
      discountTotal: 50,
      total: 250,
      limitExceeded: false,
    })
  })

  it('calculates line totals with cents', () => {
    expect(eventSaleLineTotal(line(3, 99.99))).toBe(299.97)
  })

  it('does not expand quantities above the per-line limit', () => {
    expect(calculateEventSaleTotals([line(101, 100)], promotion)).toEqual({
      grossTotal: 10100,
      discountTotal: 0,
      total: 10100,
      limitExceeded: true,
    })
  })

  it('does not expand quantities above the total limit', () => {
    expect(
      calculateEventSaleTotals(
        [
          line(100, 100),
          line(100, 100),
          line(100, 100),
          line(100, 100),
          line(100, 100),
          line(1, 100),
        ],
        promotion,
      ),
    ).toEqual({
      grossTotal: 50100,
      discountTotal: 0,
      total: 50100,
      limitExceeded: true,
    })
  })
})
