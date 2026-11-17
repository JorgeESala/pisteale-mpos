import { describe, expect, it } from 'vitest'
import type { EventExpenseView, EventLeftoverCountView, EventView } from '@/types/database'
import type { EventReport } from './event-reporting'
import type { PendingEventExpense } from './offline-queue'
import { buildEventPdfModel } from './event-report-pdf'

const event: EventView = {
  id: 'event-1',
  folio: 'EVT-2026-00001',
  name: 'Evento de prueba',
  venue: 'Parque',
  event_date: '2026-11-14',
  start_time: '18:00',
  end_time: '23:00',
  status: 'closed',
  promotion_enabled: true,
  bundle_qty: 2,
  bundle_price: 180,
  opening_cash: 500,
  notes: '',
  created_by: null,
  created_by_name: null,
  created_at: '2026-11-10T00:00:00.000Z',
  updated_at: '2026-11-10T00:00:00.000Z',
  sales_count: 45,
  drinks_count: 70,
  gross_sales: 5200,
  discount_total: 200,
  sales_total: 5000,
  expenses_total: 4800,
  expenses_count: 4,
  profit: 200,
  margin_percent: 4,
  supply_expenses_total: 4500,
  other_expenses_total: 300,
  inventory_current_value: 2000,
  inventory_transferred_value: 0,
  inventory_leftover_value: 2000,
  negative_stock_count: 0,
  negative_stock_value: 0,
  result_total: 2200,
  result_margin_percent: 44,
  promotion_sales_count: 25,
  regular_sales_count: 20,
  manual_leftover_value: 2000,
  automatic_inventory_value: 2000,
  leftover_item_count: 1,
  leftover_counted_items: 1,
  leftover_count_complete: true,
}

const report: EventReport = {
  grossSales: 5200,
  discountTotal: 200,
  salesTotal: 5000,
  supplyExpensesTotal: 4500,
  otherExpensesTotal: 300,
  expensesTotal: 4800,
  leftoverInventoryValue: 2000,
  automaticInventoryValue: 2000,
  leftoverCountComplete: true,
  leftoverCountedItems: 1,
  leftoverItemCount: 1,
  negativeStockCount: 0,
  negativeStockValue: 0,
  profit: 200,
  marginPercent: 4,
  resultTotal: 2200,
  resultMarginPercent: 44,
  promotionSalesCount: 25,
  regularSalesCount: 20,
  salesCount: 45,
  drinksCount: 70,
  expensesCount: 4,
  paymentBreakdown: {
    cash: { sales: 5000, expenses: 4800 },
    card: { sales: 0, expenses: 0 },
    transfer: { sales: 0, expenses: 0 },
    other: { sales: 0, expenses: 0 },
  },
  cashExpected: 700,
}

const savedExpense: EventExpenseView = {
  id: 'expense-1',
  client_id: 'client-1',
  event_id: 'event-1',
  category: 'supplies',
  description: 'Carga de inventario',
  amount: 4500,
  payment_method: 'cash',
  reference: '',
  spent_at: '2026-11-14T18:00:00.000Z',
  notes: '',
  created_by: null,
  created_at: '2026-11-14T18:00:00.000Z',
  updated_at: '2026-11-14T18:00:00.000Z',
  updated_by: null,
  updated_by_name: null,
  event_folio: 'EVT-2026-00001',
  event_name: 'Evento de prueba',
  created_by_name: null,
  inventory_load_id: 'load-1',
}

const otherExpense: EventExpenseView = {
  ...savedExpense,
  id: 'expense-2',
  client_id: 'client-2',
  category: 'transport',
  description: 'Transporte',
  amount: 300,
  inventory_load_id: null,
}

const pendingExpense: PendingEventExpense = {
  clientId: 'pending-1',
  eventId: 'event-1',
  category: 'other',
  description: 'Gasto pendiente',
  amount: 50,
  paymentMethod: 'cash',
  reference: '',
  spentAt: '2026-11-14T19:00:00.000Z',
  notes: '',
  queuedAt: 0,
  status: 'pending',
  error: null,
}

const leftoverCounts: EventLeftoverCountView[] = [
  {
    id: 'count-1',
    event_id: 'event-1',
    item_id: 'item-1',
    item_name: 'Vodka',
    group_name: 'Vodka',
    base_unit: 'ml',
    purchase_unit: 'botella',
    purchase_factor: 1000,
    quantity: 2,
    unit: 'botella',
    unit_factor: 1000,
    base_qty: 2000,
    unit_cost: 1,
    value: 2000,
    notes: '',
    counted_by: null,
    counted_by_name: 'Jorge',
    counted_at: '2026-11-14T23:00:00.000Z',
    updated_by: null,
    updated_by_name: 'Jorge',
    updated_at: '2026-11-14T23:00:00.000Z',
  },
]
describe('event PDF model', () => {
  it('builds the final summary, expenses and leftover inventory', () => {
    const model = buildEventPdfModel({
      event,
      report,
      expenses: [savedExpense, otherExpense],
      pendingExpenses: [pendingExpense],
      leftoverCounts,
      generatedByName: 'Jorge',
      isPartial: false,
      generatedAt: '14 nov 2026, 10:00',
    })

    expect(model.filename).toBe('PISTEALE-EVT-2026-00001-2026-11-14.pdf')
    expect(model.summary).toEqual([
      { label: 'Venta total', value: 5000, kind: 'sale' },
      { label: 'Gastos de insumos', value: 4500, kind: 'subtract' },
      { label: 'Otros gastos', value: 300, kind: 'subtract' },
      { label: 'Costo de producto/insumos sobrante', value: 2000, kind: 'add' },
      { label: 'Ganancia', value: 2200, kind: 'total' },
    ])
    expect(model.salesOrigin).toBe('25 con promoción · 20 sin promoción')
    expect(model.supplyExpenses.map((expense) => expense.id)).toEqual(['expense-1'])
    expect(model.otherExpenses.map((expense) => expense.id)).toEqual(['pending-1', 'expense-2'])
    expect(model.inventory).toHaveLength(1)
    expect(model.inventory[0]?.quantity).toBe(2)
    expect(model.inventory[0]?.unit).toBe('botella')
    expect(model.inventory[0]?.value).toBe(2000)
    expect(model.warnings).toEqual([])
  })

  it('marks negative stock and partial results', () => {
    const model = buildEventPdfModel({
      event,
      report: {
        ...report,
        negativeStockCount: 1,
        negativeStockValue: -100,
        leftoverInventoryValue: 1900,
        resultTotal: 2100,
        leftoverCountComplete: false,
        leftoverCountedItems: 0,
        leftoverItemCount: 1,
      },
      expenses: [],
      pendingExpenses: [],
      leftoverCounts,
      generatedByName: 'Jorge',
      isPartial: true,
      generatedAt: '14 nov 2026, 10:00',
    })

    expect(model.warnings).toHaveLength(3)
    expect(model.warnings[0]).toContain('Inventario del sistema con stock negativo')
    expect(model.warnings[1]).toContain('Conteo de sobrantes pendiente')
    expect(model.warnings[2]).toContain('Resultado parcial')
  })
})
