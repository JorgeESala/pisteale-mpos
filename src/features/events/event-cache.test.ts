import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventView } from '@/types/database'
import {
  clearEventDetailCache,
  hasEventOfflineData,
  loadEventDetailCache,
  loadEventListCache,
  loadEventProductsCache,
  saveEventDetailCache,
  saveEventListCache,
  saveEventProductsCache,
} from './event-cache'

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
  opening_cash: 0,
  notes: '',
  created_by: null,
  created_by_name: null,
  created_at: '2026-11-10T00:00:00.000Z',
  updated_at: '2026-11-10T00:00:00.000Z',
  sales_count: 0,
  drinks_count: 0,
  gross_sales: 0,
  discount_total: 0,
  sales_total: 0,
  expenses_total: 0,
  expenses_count: 0,
  profit: 0,
  margin_percent: null,
}

const bundle = {
  event,
  sales: [],
  saleItems: [],
  expenses: [],
}

const product = {
  id: 'product-1',
  name: 'Mojito',
  price: 120,
  kind: 'preparado' as const,
  is_alcoholic: true,
}

describe('event cache', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves and restores event data per user', () => {
    saveEventListCache('user-1', [event])
    saveEventProductsCache('user-1', [product])
    saveEventDetailCache('user-1', bundle)

    expect(loadEventListCache('user-1')).toEqual([event])
    expect(loadEventProductsCache('user-1')).toEqual([product])
    expect(loadEventDetailCache('user-1', event.id)).toEqual(bundle)
    expect(hasEventOfflineData('user-1', event.id)).toBe(true)
    expect(loadEventDetailCache('user-2', event.id)).toBeNull()
  })

  it('expires old caches', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T00:00:00.000Z'))
    saveEventDetailCache('user-1', bundle)

    vi.setSystemTime(new Date('2026-11-20T00:00:00.000Z'))

    expect(loadEventDetailCache('user-1', event.id)).toBeNull()
  })

  it('ignores corrupt caches', () => {
    window.localStorage.setItem('pisteale:user:user-1:event-list-cache:v2', '{"bad":true}')

    expect(loadEventListCache('user-1')).toBeNull()
  })

  it('clears event detail data', () => {
    saveEventDetailCache('user-1', bundle)
    clearEventDetailCache('user-1', event.id)

    expect(loadEventDetailCache('user-1', event.id)).toBeNull()
  })
})
