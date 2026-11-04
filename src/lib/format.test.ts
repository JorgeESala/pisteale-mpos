import { describe, expect, it } from 'vitest'
import { formatCurrency } from './format'

describe('formatCurrency', () => {
  it('formats MXN amounts with two decimals', () => {
    expect(formatCurrency(1234.5)).toMatch(/1,234\.50/)
  })
})
