import type { OrderTier, SaleProduct } from '@/types/database'

export type SaleCartLine = {
  productId: string
  productName: string
  tier: OrderTier
  qty: number
  unitPrice: number
}

export function saleUnitPrice(product: SaleProduct, tier: OrderTier) {
  if (tier === 'premium' && product.is_alcoholic && product.premium_price !== null) {
    return product.premium_price
  }

  return product.price
}

export function saleLineTotal(line: SaleCartLine) {
  return Math.round(line.unitPrice * line.qty * 100) / 100
}

export function saleSubtotal(lines: SaleCartLine[]) {
  return Math.round(lines.reduce((sum, line) => sum + saleLineTotal(line), 0) * 100) / 100
}

export function addSaleLine(
  lines: SaleCartLine[],
  product: SaleProduct,
  tier: OrderTier,
  qty: number,
): SaleCartLine[] {
  const effectiveTier: OrderTier =
    tier === 'premium' && product.is_alcoholic && product.premium_price !== null
      ? 'premium'
      : 'normal'
  const existing = lines.find(
    (line) => line.productId === product.id && line.tier === effectiveTier,
  )

  if (existing) {
    return lines.map((line) => (line === existing ? { ...line, qty: line.qty + qty } : line))
  }

  return [
    ...lines,
    {
      productId: product.id,
      productName: product.name,
      tier: effectiveTier,
      qty,
      unitPrice: saleUnitPrice(product, effectiveTier),
    },
  ]
}

export function canSellPremium(product: SaleProduct) {
  return product.is_alcoholic && product.premium_price !== null
}
