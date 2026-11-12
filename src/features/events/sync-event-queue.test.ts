import { afterEach, describe, expect, it, vi } from 'vitest'
import { processPendingQueue } from './sync-event-queue'

type Item = {
  clientId: string
  eventId: string
  status: 'pending' | 'error'
}

const items: Item[] = [
  { clientId: 'a', eventId: 'event-1', status: 'pending' },
  { clientId: 'b', eventId: 'event-2', status: 'pending' },
  { clientId: 'c', eventId: 'event-3', status: 'error' },
]

describe('processPendingQueue', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('skips error items by default', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const onSuccess = vi.fn()
    const onError = vi.fn()

    const result = await processPendingQueue({
      kind: 'sale',
      items: items.filter((item) => item.status === 'pending'),
      send,
      onSuccess,
      onError,
    })

    expect(send).toHaveBeenCalledTimes(2)
    expect(result.syncedEventIds).toEqual(['event-1', 'event-2'])
    expect(result.errors).toEqual([])
  })

  it('stops when connectivity fails', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(undefined)
    const onSuccess = vi.fn()
    const onError = vi.fn()

    const result = await processPendingQueue({
      kind: 'sale',
      items,
      send,
      onSuccess,
      onError,
    })

    expect(send).toHaveBeenCalledTimes(1)
    expect(result.connectivityStopped).toBe(true)
    expect(onError).not.toHaveBeenCalled()
  })

  it('marks permanent errors and continues', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce({ code: '22023', message: 'Precio inválido' })
      .mockResolvedValue(undefined)
    const onSuccess = vi.fn()
    const onError = vi.fn()

    const result = await processPendingQueue({
      kind: 'sale',
      items: items.filter((item) => item.status === 'pending'),
      send,
      onSuccess,
      onError,
    })

    expect(send).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledWith(items[0], 'Precio inválido')
    expect(result.errors).toEqual([{ kind: 'sale', clientId: 'a', message: 'Precio inválido' }])
    expect(result.syncedEventIds).toEqual(['event-2'])
  })
})
