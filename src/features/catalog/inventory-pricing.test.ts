import { describe, expect, it } from 'vitest'
import {
  formatPackagePrice,
  packagePresentationLabel,
  packagePriceToUnitCost,
  parsePackagePriceInput,
} from './inventory-pricing'

describe('packagePriceToUnitCost', () => {
  it('calculates the unit cost from a package price', () => {
    expect(packagePriceToUnitCost(100, 1000)).toBe(0.1)
  })

  it('rounds to six decimals', () => {
    expect(packagePriceToUnitCost(350, 750)).toBe(0.466667)
  })

  it('returns null without a price or factor', () => {
    expect(packagePriceToUnitCost(0, 750)).toBeNull()
    expect(packagePriceToUnitCost(100, 0)).toBeNull()
    expect(packagePriceToUnitCost(Number.NaN, 750)).toBeNull()
  })
})

describe('parsePackagePriceInput', () => {
  it('treats an empty value as zero', () => {
    expect(parsePackagePriceInput('')).toBe(0)
    expect(parsePackagePriceInput('   ')).toBe(0)
  })

  it('parses and rounds to four decimals', () => {
    expect(parsePackagePriceInput('100')).toBe(100)
    expect(parsePackagePriceInput('1.495')).toBe(1.495)
    expect(parsePackagePriceInput('12.34567')).toBe(12.3457)
  })

  it('rejects negative or invalid values', () => {
    expect(parsePackagePriceInput('-1')).toBeNull()
    expect(parsePackagePriceInput('abc')).toBeNull()
  })
})

describe('formatPackagePrice', () => {
  it('keeps up to four decimals for small prices and two for larger ones', () => {
    expect(formatPackagePrice(100)).toBe('$100.00')
    expect(formatPackagePrice(1.495)).toBe('$1.495')
    expect(formatPackagePrice(214.2878)).toBe('$214.29')
    expect(formatPackagePrice(71.4998)).toBe('$71.50')
  })
})

describe('packagePresentationLabel', () => {
  it('shows liters for large ml packages', () => {
    expect(packagePresentationLabel('botella', 1000, 'ml')).toBe('botella de 1 L')
    expect(packagePresentationLabel('botella', 1750, 'ml')).toBe('botella de 1.75 L')
  })

  it('shows milliliters for small ml packages', () => {
    expect(packagePresentationLabel('botella', 750, 'ml')).toBe('botella de 750 ml')
  })

  it('shows kilograms for large g packages', () => {
    expect(packagePresentationLabel('bolsa', 5000, 'g')).toBe('bolsa de 5 kg')
  })

  it('describes piece packages', () => {
    expect(packagePresentationLabel('caja', 25, 'pza')).toBe('caja de 25 pza')
    expect(packagePresentationLabel('pza', 1, 'pza')).toBe('1 pieza')
  })
})
