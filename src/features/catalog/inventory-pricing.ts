import type { BaseUnit } from '@/types/database'

export function packagePriceToUnitCost(
  packagePrice: number,
  purchaseFactor: number,
): number | null {
  if (!Number.isFinite(packagePrice) || packagePrice <= 0) return null
  if (!Number.isFinite(purchaseFactor) || purchaseFactor <= 0) return null

  return Math.round((packagePrice / purchaseFactor) * 1_000_000) / 1_000_000
}

export function parsePackagePriceInput(value: string): number | null {
  const trimmed = value.trim()

  if (trimmed === '') return 0

  const parsed = Number(trimmed)

  if (!Number.isFinite(parsed) || parsed < 0) return null

  return Math.round(parsed * 10_000) / 10_000
}

export function formatPackagePrice(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(value) < 10 ? 4 : 2,
  }).format(value)
}

export function packagePresentationLabel(
  purchaseUnit: string,
  purchaseFactor: number,
  baseUnit: BaseUnit,
): string {
  const quantityFormatter = new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 4,
  })

  if (baseUnit === 'pza') {
    return purchaseFactor === 1
      ? '1 pieza'
      : `${purchaseUnit} de ${quantityFormatter.format(purchaseFactor)} pza`
  }

  if (baseUnit === 'ml' && purchaseFactor >= 1000) {
    return `${purchaseUnit} de ${quantityFormatter.format(purchaseFactor / 1000)} L`
  }

  if (baseUnit === 'g' && purchaseFactor >= 1000) {
    return `${purchaseUnit} de ${quantityFormatter.format(purchaseFactor / 1000)} kg`
  }

  return `${purchaseUnit} de ${quantityFormatter.format(purchaseFactor)} ${baseUnit}`
}
