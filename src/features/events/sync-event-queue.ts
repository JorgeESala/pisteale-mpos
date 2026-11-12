import { isConnectivityError } from './connectivity'

export type QueueItemError = {
  kind: 'sale' | 'expense'
  clientId: string
  message: string
}

export type QueueProcessResult = {
  syncedEventIds: string[]
  errors: QueueItemError[]
  connectivityStopped: boolean
}

type QueueItem = {
  clientId: string
  eventId: string
  status: 'pending' | 'error'
}

type ProcessQueueOptions<T extends QueueItem> = {
  kind: 'sale' | 'expense'
  items: T[]
  send: (item: T) => Promise<void>
  onSuccess: (item: T) => void
  onError: (item: T, message: string) => void
}

export async function processPendingQueue<T extends QueueItem>({
  kind,
  items,
  send,
  onSuccess,
  onError,
}: ProcessQueueOptions<T>): Promise<QueueProcessResult> {
  const result: QueueProcessResult = {
    syncedEventIds: [],
    errors: [],
    connectivityStopped: false,
  }

  for (const item of items) {
    try {
      await send(item)
      onSuccess(item)
      result.syncedEventIds.push(item.eventId)
    } catch (error) {
      if (isConnectivityError(error)) {
        result.connectivityStopped = true
        break
      }

      const message = getErrorMessage(error)
      onError(item, message)
      result.errors.push({ kind, clientId: item.clientId, message })
    }
  }

  return result
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return 'No se pudo sincronizar el registro.'
}
