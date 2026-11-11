export type EventSaleLineInput = {
  productId: string | null
  productName: string
  quantity: number
  unitPrice: number
  promotionEligible: boolean
}

export type EventPromotionSettings = {
  enabled: boolean
  bundleQty: number
  bundlePrice: number
}

export type EventSaleTotals = {
  grossTotal: number
  discountTotal: number
  total: number
}

export const EVENT_SALE_MAX_LINE_QTY = 100
export const EVENT_SALE_MAX_TOTAL_UNITS = 500

export function roundEventMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function eventSaleLineTotal(line: EventSaleLineInput) {
  return roundEventMoney(line.unitPrice * line.quantity)
}

type SaleUnit = {
  price: number
  eligible: boolean
}

export function calculateEventSaleTotals(
  lines: EventSaleLineInput[],
  promotion: EventPromotionSettings,
): EventSaleTotals {
  let grossTotal = 0
  let totalUnits = 0
  let exceedsLimit = false

  for (const line of lines) {
    const quantity = Math.max(0, Math.trunc(line.quantity))
    const price = roundEventMoney(Math.max(0, line.unitPrice))

    grossTotal += price * quantity
    totalUnits += quantity

    if (quantity > EVENT_SALE_MAX_LINE_QTY) {
      exceedsLimit = true
    }
  }

  grossTotal = roundEventMoney(grossTotal)

  if (exceedsLimit || totalUnits > EVENT_SALE_MAX_TOTAL_UNITS) {
    return { grossTotal, discountTotal: 0, total: grossTotal }
  }

  const units: SaleUnit[] = []

  for (const line of lines) {
    const quantity = Math.max(0, Math.trunc(line.quantity))
    const price = roundEventMoney(Math.max(0, line.unitPrice))

    for (let index = 0; index < quantity; index += 1) {
      units.push({ price, eligible: line.promotionEligible })
    }
  }

  const bundleQty = Math.trunc(promotion.bundleQty)

  if (!promotion.enabled || bundleQty < 2 || promotion.bundlePrice < 0) {
    return { grossTotal, discountTotal: 0, total: grossTotal }
  }

  const eligiblePrices = units
    .filter((unit) => unit.eligible)
    .map((unit) => unit.price)
    .sort((left, right) => right - left)
  const ineligibleTotal = units
    .filter((unit) => !unit.eligible)
    .reduce((sum, unit) => sum + unit.price, 0)

  let promotionTotal = 0

  for (let index = 0; index < eligiblePrices.length; index += bundleQty) {
    const chunk = eligiblePrices.slice(index, index + bundleQty)
    const chunkTotal = chunk.reduce((sum, price) => sum + price, 0)

    promotionTotal +=
      chunk.length === bundleQty
        ? Math.min(roundEventMoney(promotion.bundlePrice), chunkTotal)
        : chunkTotal
  }

  const total = roundEventMoney(promotionTotal + ineligibleTotal)
  const discountTotal = Math.max(0, roundEventMoney(grossTotal - total))

  return { grossTotal, discountTotal, total }
}
