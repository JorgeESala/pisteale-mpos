import { describe, expect, it } from 'vitest'
import { formatCurrency, formatUnitCost } from './format'

describe('formatCurrency', () => {
  it('formats MXN amounts with two decimals', () => {
    expect(formatCurrency(1234.5)).toMatch(/1,234\.50/)
  })
})

describe('formatUnitCost', () => {
  it('formats unit costs with four decimals', () => {
    expect(formatUnitCost(0.1)).toMatch(/0\.1000/)
  })
})
