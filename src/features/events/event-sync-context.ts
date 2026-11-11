import { createContext, useContext } from 'react'
import type { PendingEventExpense, PendingEventSale } from './offline-queue'

export type EventSyncContextValue = {
  pendingSales: PendingEventSale[]
  pendingExpenses: PendingEventExpense[]
  pendingCount: number
  errorCount: number
  queuedCount: number
  syncing: boolean
  syncError: string | null
  refresh: () => void
  syncNow: () => Promise<void>
  retryErrors: () => Promise<void>
}

export const EventSyncContext = createContext<EventSyncContextValue | null>(null)

export function useEventSync() {
  const context = useContext(EventSyncContext)

  if (!context) {
    throw new Error('useEventSync debe usarse dentro de EventSyncProvider')
  }

  return context
}
