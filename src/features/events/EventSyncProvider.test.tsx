import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventSyncProvider } from './EventSyncProvider'
import { useEventSync } from './event-sync-context'
import { enqueueEventSale, loadPendingEventSales } from './offline-queue'
import { createEventSale } from './queries'

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ profile: { id: 'user-1' } }),
}))

vi.mock('@/lib/use-online-status', () => ({
  useOnlineStatus: () => true,
}))

vi.mock('./queries', () => ({
  createEventSale: vi.fn(),
  createEventExpense: vi.fn(),
}))

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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <EventSyncProvider>{children}</EventSyncProvider>
      </QueryClientProvider>
    )
  }
}

describe('EventSyncProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(createEventSale).mockReset()
  })

  it('syncs pending sales and clears the local queue', async () => {
    vi.mocked(createEventSale).mockResolvedValue('sale-1')
    enqueueEventSale('user-1', saleInput)

    const { result } = renderHook(() => useEventSync(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(loadPendingEventSales('user-1')).toHaveLength(0)
    })

    expect(createEventSale).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: saleInput.clientId }),
    )

    await waitFor(() => {
      expect(result.current.queuedCount).toBe(0)
    })
  })

  it('marks permanent errors and retries them manually', async () => {
    vi.mocked(createEventSale).mockRejectedValue({
      code: '22023',
      message: 'Promoción inválida',
    })
    enqueueEventSale('user-1', saleInput)

    const { result } = renderHook(() => useEventSync(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.errorCount).toBe(1)
    })

    expect(loadPendingEventSales('user-1')[0]).toMatchObject({
      status: 'error',
      error: 'Promoción inválida',
    })

    vi.mocked(createEventSale).mockResolvedValue('sale-1')

    await act(async () => {
      await result.current.retryErrors()
    })

    await waitFor(() => {
      expect(loadPendingEventSales('user-1')).toHaveLength(0)
    })
    expect(result.current.errorCount).toBe(0)
  })
})
