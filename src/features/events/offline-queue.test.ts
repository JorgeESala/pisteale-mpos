import { beforeEach, describe, expect, it } from 'vitest'
import {
  enqueueEventExpense,
  enqueueEventSale,
  loadPendingEventExpenses,
  loadPendingEventSales,
  markPendingEventSaleError,
  pendingExpensesForEvent,
  pendingSalesForEvent,
  removePendingEventExpense,
  removePendingEventSale,
} from './offline-queue'

const saleInput = {
  clientId: '11111111-1111-1111-1111-111111111111',
  eventId: '22222222-2222-2222-2222-222222222222',
  soldAt: '2026-11-14T20:00:00.000Z',
  items: [
    {
      productId: null,
      productName: 'Mojito',
      quantity: 2,
      unitPrice: 100,
      promotionEligible: true,
    },
  ],
  applyPromotion: true,
  paymentMethod: 'cash' as const,
  notes: '',
}

const expenseInput = {
  clientId: '33333333-3333-3333-3333-333333333333',
  eventId: '22222222-2222-2222-2222-222222222222',
  category: 'supplies' as const,
  description: 'Hielo',
  amount: 150,
  paymentMethod: 'cash' as const,
  reference: '',
  spentAt: '2026-11-14T10:00:00.000Z',
  notes: '',
}

describe('event offline queue', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('stores a sale and does not duplicate it by client id', () => {
    enqueueEventSale(saleInput)
    enqueueEventSale(saleInput)

    expect(loadPendingEventSales()).toHaveLength(1)
    expect(pendingSalesForEvent(saleInput.eventId)).toHaveLength(1)
  })

  it('removes a synced sale', () => {
    enqueueEventSale(saleInput)
    removePendingEventSale(saleInput.clientId)

    expect(loadPendingEventSales()).toHaveLength(0)
  })

  it('marks a sale with an error', () => {
    enqueueEventSale(saleInput)
    markPendingEventSaleError(saleInput.clientId, 'Precio inválido')

    expect(loadPendingEventSales()[0]).toMatchObject({
      status: 'error',
      error: 'Precio inválido',
    })
  })

  it('stores and removes expenses', () => {
    enqueueEventExpense(expenseInput)

    expect(loadPendingEventExpenses()).toHaveLength(1)
    expect(pendingExpensesForEvent(expenseInput.eventId)).toHaveLength(1)

    removePendingEventExpense(expenseInput.clientId)

    expect(loadPendingEventExpenses()).toHaveLength(0)
  })

  it('ignores corrupt queue data', () => {
    window.localStorage.setItem('pisteale:event-sales-queue:v1', '{"bad":true}')

    expect(loadPendingEventSales()).toEqual([])
  })
})
