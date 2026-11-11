import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventView } from '@/types/database'
import { saveEventDetailCache, saveEventProductsCache } from './event-cache'
import { prepareEventOffline } from './prepare-offline'

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

const product = {
  id: 'product-1',
  name: 'Mojito',
  price: 120,
  kind: 'preparado' as const,
  is_alcoholic: true,
}

function seedCaches() {
  saveEventDetailCache('user-1', {
    event,
    sales: [],
    saleItems: [],
    expenses: [],
  })
  saveEventProductsCache('user-1', [product])
}

const baseOptions = {
  userId: 'user-1',
  eventId: 'event-1',
  refetchBundle: async () => ({ isError: false, error: null, data: event }),
  refetchProducts: async () => ({ isError: false, error: null, data: [product] }),
  fetchEvents: async () => [event],
}

describe('prepareEventOffline', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('succeeds when event and products are cached', async () => {
    seedCaches()
    const persist = vi.fn().mockResolvedValue(true)

    await expect(prepareEventOffline({ ...baseOptions, persist })).resolves.toEqual({ ok: true })
    expect(persist).toHaveBeenCalled()
  })

  it('fails when the bundle refetch fails', async () => {
    seedCaches()

    const result = await prepareEventOffline({
      ...baseOptions,
      refetchBundle: async () => ({
        isError: true,
        error: new Error('sin red'),
        data: null,
      }),
    })

    expect(result).toEqual({ ok: false, message: 'sin red' })
  })

  it('fails when the products refetch fails', async () => {
    seedCaches()

    const result = await prepareEventOffline({
      ...baseOptions,
      refetchProducts: async () => ({
        isError: true,
        error: new Error('catálogo no disponible'),
        data: null,
      }),
    })

    expect(result).toEqual({ ok: false, message: 'catálogo no disponible' })
  })

  it('fails when caches were not actually saved', async () => {
    const result = await prepareEventOffline(baseOptions)

    expect(result.ok).toBe(false)
  })

  it('does not fail if only the event list fetch fails', async () => {
    seedCaches()

    const result = await prepareEventOffline({
      ...baseOptions,
      fetchEvents: async () => {
        throw new Error('lista no disponible')
      },
    })

    expect(result).toEqual({ ok: true })
  })
})
