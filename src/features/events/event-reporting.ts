import type { EventExpenseView, EventSaleView, PaymentMethod } from '@/types/database'
import type { EventBundle } from './event-cache'
import { calculateEventSaleTotals, roundEventMoney } from './event-pricing'
import type { PendingEventExpense, PendingEventSale } from './offline-queue'

export type PaymentBreakdown = Record<
  PaymentMethod,
  {
    sales: number
    expenses: number
  }
>

export type EventReport = {
  grossSales: number
  discountTotal: number
  salesTotal: number
  expensesTotal: number
  profit: number
  marginPercent: number | null
  salesCount: number
  drinksCount: number
  expensesCount: number
  paymentBreakdown: PaymentBreakdown
  cashExpected: number
}

function emptyPaymentBreakdown(): PaymentBreakdown {
  return {
    cash: { sales: 0, expenses: 0 },
    card: { sales: 0, expenses: 0 },
    transfer: { sales: 0, expenses: 0 },
    other: { sales: 0, expenses: 0 },
  }
}

export function pendingSaleTotals(sale: PendingEventSale) {
  return calculateEventSaleTotals(sale.items, {
    enabled: sale.applyPromotion,
    bundleQty: sale.bundleQty,
    bundlePrice: sale.bundlePrice,
  })
}

export function calculateEventReport(
  bundle: EventBundle,
  pendingSales: PendingEventSale[],
  pendingExpenses: PendingEventExpense[],
): EventReport {
  const { event } = bundle
  const paymentBreakdown = emptyPaymentBreakdown()

  for (const sale of bundle.sales as EventSaleView[]) {
    paymentBreakdown[sale.payment_method].sales += sale.total
  }

  for (const expense of bundle.expenses as EventExpenseView[]) {
    paymentBreakdown[expense.payment_method].expenses += expense.amount
  }

  let grossSales = event.gross_sales
  let discountTotal = event.discount_total
  let salesTotal = event.sales_total
  let drinksCount = event.drinks_count

  for (const sale of pendingSales) {
    const totals = pendingSaleTotals(sale)
    grossSales += totals.grossTotal
    discountTotal += totals.discountTotal
    salesTotal += totals.total
    drinksCount += sale.items.reduce((sum, item) => sum + item.quantity, 0)
    paymentBreakdown[sale.paymentMethod].sales += totals.total
  }

  let expensesTotal = event.expenses_total

  for (const expense of pendingExpenses) {
    expensesTotal += expense.amount
    paymentBreakdown[expense.paymentMethod].expenses += expense.amount
  }

  grossSales = roundEventMoney(grossSales)
  discountTotal = roundEventMoney(discountTotal)
  salesTotal = roundEventMoney(salesTotal)
  expensesTotal = roundEventMoney(expensesTotal)

  for (const method of Object.keys(paymentBreakdown) as PaymentMethod[]) {
    paymentBreakdown[method].sales = roundEventMoney(paymentBreakdown[method].sales)
    paymentBreakdown[method].expenses = roundEventMoney(paymentBreakdown[method].expenses)
  }

  const profit = roundEventMoney(salesTotal - expensesTotal)
  const marginPercent = salesTotal > 0 ? Math.round((profit / salesTotal) * 1000) / 10 : null

  return {
    grossSales,
    discountTotal,
    salesTotal,
    expensesTotal,
    profit,
    marginPercent,
    salesCount: event.sales_count + pendingSales.length,
    drinksCount,
    expensesCount: event.expenses_count + pendingExpenses.length,
    paymentBreakdown,
    cashExpected: roundEventMoney(
      event.opening_cash + paymentBreakdown.cash.sales - paymentBreakdown.cash.expenses,
    ),
  }
}
