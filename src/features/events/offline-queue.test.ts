import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OfflineStorageError,
  createClientId,
  enqueueEventExpense,
  enqueueEventSale,
  loadPendingEventExpenses,
  loadPendingEventSales,
  markPendingEventSaleError,
  pendingExpensesForEvent,
  pendingSalesForEvent,
  removePendingEventExpense,
  removePendingEventSale,
  retryPendingEventSale,
} from './offline-queue'

const userId = 'user-1'
const otherUserId = 'user-2'

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
  bundleQty: 2,
  bundlePrice: 180,
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

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('stores a sale and does not duplicate it by client id', () => {
    enqueueEventSale(userId, saleInput)
    enqueueEventSale(userId, saleInput)

    expect(loadPendingEventSales(userId)).toHaveLength(1)
    expect(pendingSalesForEvent(userId, saleInput.eventId)).toHaveLength(1)
  })

  it('isolates queues per user', () => {
    enqueueEventSale(userId, saleInput)

    expect(loadPendingEventSales(userId)).toHaveLength(1)
    expect(loadPendingEventSales(otherUserId)).toHaveLength(0)
  })

  it('removes a synced sale', () => {
    enqueueEventSale(userId, saleInput)
    removePendingEventSale(userId, saleInput.clientId)

    expect(loadPendingEventSales(userId)).toHaveLength(0)
  })

  it('marks a sale with an error and retries it', () => {
    enqueueEventSale(userId, saleInput)
    markPendingEventSaleError(userId, saleInput.clientId, 'Precio inválido')

    expect(loadPendingEventSales(userId)[0]).toMatchObject({
      status: 'error',
      error: 'Precio inválido',
    })

    retryPendingEventSale(userId, saleInput.clientId)

    expect(loadPendingEventSales(userId)[0]).toMatchObject({
      status: 'pending',
      error: null,
    })
  })

  it('stores and removes expenses', () => {
    enqueueEventExpense(userId, expenseInput)

    expect(loadPendingEventExpenses(userId)).toHaveLength(1)
    expect(pendingExpensesForEvent(userId, expenseInput.eventId)).toHaveLength(1)

    removePendingEventExpense(userId, expenseInput.clientId)

    expect(loadPendingEventExpenses(userId)).toHaveLength(0)
  })

  it('throws when localStorage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => enqueueEventSale(userId, saleInput)).toThrow(OfflineStorageError)
    expect(() => enqueueEventExpense(userId, expenseInput)).toThrow(OfflineStorageError)
  })

  it('generates a valid UUID when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = index
        }
        return bytes
      },
    })

    expect(createClientId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('ignores corrupt queue data', () => {
    window.localStorage.setItem('pisteale:user:user-1:event-sales-queue:v2', '{"bad":true}')

    expect(loadPendingEventSales(userId)).toEqual([])
  })
})
