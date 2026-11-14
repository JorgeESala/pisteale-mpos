import { describe, expect, it } from 'vitest'
import type { EventExpenseView, EventSaleView, EventView } from '@/types/database'
import { calculateEventReport } from './event-reporting'
import type { PendingEventExpense, PendingEventSale } from './offline-queue'

const event: EventView = {
  id: 'event-1',
  folio: 'EVT-2026-00001',
  name: 'Parque',
  venue: 'Parque central',
  event_date: '2026-11-14',
  start_time: null,
  end_time: null,
  status: 'open',
  promotion_enabled: true,
  bundle_qty: 2,
  bundle_price: 180,
  opening_cash: 500,
  notes: '',
  created_by: null,
  created_by_name: null,
  created_at: '2026-11-10T00:00:00.000Z',
  updated_at: '2026-11-10T00:00:00.000Z',
  sales_count: 1,
  drinks_count: 2,
  gross_sales: 200,
  discount_total: 20,
  sales_total: 180,
  expenses_total: 50,
  expenses_count: 1,
  profit: 130,
  margin_percent: 72.2,
}

const pendingSale: PendingEventSale = {
  clientId: 'sale-1',
  eventId: 'event-1',
  soldAt: '2026-11-14T20:00:00.000Z',
  items: [
    {
      productId: null,
      productName: 'Mojito',
      quantity: 3,
      unitPrice: 100,
      promotionEligible: true,
    },
  ],
  applyPromotion: true,
  bundleQty: 2,
  bundlePrice: 180,
  paymentMethod: 'cash',
  notes: '',
  queuedAt: 0,
  status: 'pending',
  error: null,
}

const pendingExpense: PendingEventExpense = {
  clientId: 'expense-1',
  eventId: 'event-1',
  category: 'supplies',
  description: 'Hielo',
  amount: 30,
  paymentMethod: 'cash',
  reference: '',
  spentAt: '2026-11-14T10:00:00.000Z',
  notes: '',
  queuedAt: 0,
  status: 'pending',
  error: null,
}

const savedSale: EventSaleView = {
  id: 'saved-sale-1',
  client_id: 'client-saved-1',
  event_id: 'event-1',
  sold_at: '2026-11-14T19:00:00.000Z',
  payment_method: 'cash',
  gross_total: 200,
  discount_total: 20,
  total: 180,
  promotion_applied: true,
  bundle_qty: 2,
  bundle_price: 180,
  notes: '',
  created_by: null,
  created_at: '2026-11-14T19:00:00.000Z',
  event_folio: 'EVT-2026-00001',
  event_name: 'Parque',
  event_date: '2026-11-14',
  created_by_name: null,
  item_count: 1,
  drinks_count: 2,
}

const savedExpense: EventExpenseView = {
  id: 'saved-expense-1',
  client_id: 'client-expense-1',
  event_id: 'event-1',
  category: 'ice',
  description: 'Hielo',
  amount: 50,
  payment_method: 'cash',
  reference: '',
  spent_at: '2026-11-14T10:00:00.000Z',
  notes: '',
  created_by: null,
  created_at: '2026-11-14T10:00:00.000Z',
  updated_at: '2026-11-14T10:00:00.000Z',
  updated_by: null,
  event_folio: 'EVT-2026-00001',
  event_name: 'Parque',
  created_by_name: null,
  updated_by_name: null,
  inventory_load_id: null,
}

describe('event report', () => {
  it('adds pending sales and expenses to the totals', () => {
    const report = calculateEventReport(
      {
        event,
        sales: [savedSale],
        saleItems: [],
        expenses: [savedExpense],
      },
      [pendingSale],
      [pendingExpense],
    )

    expect(report.salesTotal).toBe(460)
    expect(report.expensesTotal).toBe(80)
    expect(report.profit).toBe(380)
    expect(report.salesCount).toBe(2)
    expect(report.drinksCount).toBe(5)
    expect(report.paymentBreakdown.cash.sales).toBe(460)
    expect(report.paymentBreakdown.cash.expenses).toBe(80)
    expect(report.cashExpected).toBe(880)
  })

  it('keeps the promotion snapshot of pending sales', () => {
    const report = calculateEventReport(
      {
        event: { ...event, bundle_price: 250 },
        sales: [],
        saleItems: [],
        expenses: [],
      },
      [pendingSale],
      [],
    )

    expect(report.salesTotal).toBe(460)
  })

  it('calculates a negative result', () => {
    const report = calculateEventReport(
      {
        event: {
          ...event,
          sales_total: 100,
          expenses_total: 250,
          sales_count: 1,
          expenses_count: 1,
        },
        sales: [],
        saleItems: [],
        expenses: [],
      },
      [],
      [],
    )

    expect(report.profit).toBe(-150)
    expect(report.marginPercent).toBe(-150)
  })
})
