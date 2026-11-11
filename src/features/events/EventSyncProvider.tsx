import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { useOnlineStatus } from '@/lib/use-online-status'
import {
  loadPendingEventExpenses,
  loadPendingEventSales,
  markPendingEventExpenseError,
  markPendingEventSaleError,
  removePendingEventExpense,
  removePendingEventSale,
  retryPendingEventExpense,
  retryPendingEventSale,
  type PendingEventExpense,
  type PendingEventSale,
} from './offline-queue'
import { EventSyncContext, type EventSyncContextValue } from './event-sync-context'
import { createEventExpense, createEventSale } from './queries'
import { processPendingQueue } from './sync-event-queue'

function sameQueue<T>(left: T[], right: T[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function sendQueuedSale(sale: PendingEventSale) {
  await createEventSale({
    clientId: sale.clientId,
    eventId: sale.eventId,
    items: sale.items,
    applyPromotion: sale.applyPromotion,
    bundleQty: sale.bundleQty,
    bundlePrice: sale.bundlePrice,
    paymentMethod: sale.paymentMethod,
    notes: sale.notes,
    soldAt: sale.soldAt,
  })
}

async function sendQueuedExpense(expense: PendingEventExpense) {
  await createEventExpense({
    clientId: expense.clientId,
    eventId: expense.eventId,
    category: expense.category,
    description: expense.description,
    amount: expense.amount,
    paymentMethod: expense.paymentMethod,
    reference: expense.reference,
    spentAt: expense.spentAt,
    notes: expense.notes,
  })
}

export function EventSyncProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const userId = profile?.id ?? null
  const online = useOnlineStatus()
  const queryClient = useQueryClient()

  const [pendingSales, setPendingSales] = useState<PendingEventSale[]>([])
  const [pendingExpenses, setPendingExpenses] = useState<PendingEventExpense[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const syncingRef = useRef(false)

  const refresh = useCallback(() => {
    if (!userId) {
      setPendingSales([])
      setPendingExpenses([])
      return
    }

    const nextSales = loadPendingEventSales(userId)
    const nextExpenses = loadPendingEventExpenses(userId)

    setPendingSales((current) => (sameQueue(current, nextSales) ? current : nextSales))
    setPendingExpenses((current) => (sameQueue(current, nextExpenses) ? current : nextExpenses))
  }, [userId])

  useEffect(() => {
    queueMicrotask(refresh)
  }, [refresh])

  const syncNow = useCallback(async () => {
    if (!userId || !online || syncingRef.current) return

    const sales = loadPendingEventSales(userId)
    const expenses = loadPendingEventExpenses(userId)

    if (sales.length === 0 && expenses.length === 0) return

    syncingRef.current = true
    setSyncing(true)
    setSyncError(null)

    const eventIds = new Set<string>()

    try {
      const saleResult = await processPendingQueue({
        kind: 'sale',
        items: sales,
        send: sendQueuedSale,
        onSuccess: (sale) => {
          const removed = removePendingEventSale(userId, sale.clientId)
          if (!removed) {
            setSyncError('No se pudo actualizar la cola local de ventas.')
          }
          return removed
        },
        onError: (sale, message) => {
          markPendingEventSaleError(userId, sale.clientId, message)
          return true
        },
      })

      for (const eventId of saleResult.syncedEventIds) {
        eventIds.add(eventId)
      }

      if (saleResult.errors.length > 0) {
        setSyncError(saleResult.errors[0]?.message ?? 'No se pudo sincronizar una venta.')
      }

      if (!saleResult.connectivityStopped) {
        const expenseResult = await processPendingQueue({
          kind: 'expense',
          items: expenses,
          send: sendQueuedExpense,
          onSuccess: (expense) => {
            const removed = removePendingEventExpense(userId, expense.clientId)
            if (!removed) {
              setSyncError('No se pudo actualizar la cola local de gastos.')
            }
            return removed
          },
          onError: (expense, message) => {
            markPendingEventExpenseError(userId, expense.clientId, message)
            return true
          },
        })

        for (const eventId of expenseResult.syncedEventIds) {
          eventIds.add(eventId)
        }

        if (expenseResult.errors.length > 0) {
          setSyncError(expenseResult.errors[0]?.message ?? 'No se pudo sincronizar un gasto.')
        }
      }
    } finally {
      syncingRef.current = false
      setSyncing(false)
      refresh()

      for (const eventId of eventIds) {
        void queryClient.invalidateQueries({ queryKey: ['event_bundle', eventId] })
      }

      if (eventIds.size > 0) {
        void queryClient.invalidateQueries({ queryKey: ['events'] })
      }
    }
  }, [online, queryClient, refresh, userId])

  const retryErrors = useCallback(async () => {
    if (!userId) return

    let failed = false

    for (const sale of loadPendingEventSales(userId)) {
      if (sale.status === 'error' && !retryPendingEventSale(userId, sale.clientId)) {
        failed = true
      }
    }

    for (const expense of loadPendingEventExpenses(userId)) {
      if (expense.status === 'error' && !retryPendingEventExpense(userId, expense.clientId)) {
        failed = true
      }
    }

    if (failed) {
      setSyncError('No se pudo actualizar la cola local para reintentar.')
    }

    refresh()
    await syncNow()
  }, [refresh, syncNow, userId])

  const pendingCount =
    pendingSales.filter((sale) => sale.status === 'pending').length +
    pendingExpenses.filter((expense) => expense.status === 'pending').length
  const errorCount =
    pendingSales.filter((sale) => sale.status === 'error').length +
    pendingExpenses.filter((expense) => expense.status === 'error').length
  const queuedCount = pendingSales.length + pendingExpenses.length

  useEffect(() => {
    if (!userId || !online) return
    if (pendingCount === 0) return

    queueMicrotask(() => {
      void syncNow()
    })
    const interval = window.setInterval(() => {
      void syncNow()
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [online, pendingCount, syncNow, userId])

  const value = useMemo<EventSyncContextValue>(
    () => ({
      pendingSales,
      pendingExpenses,
      pendingCount,
      errorCount,
      queuedCount,
      syncing,
      syncError,
      refresh,
      syncNow,
      retryErrors,
    }),
    [
      pendingSales,
      pendingExpenses,
      pendingCount,
      errorCount,
      queuedCount,
      syncing,
      syncError,
      refresh,
      syncNow,
      retryErrors,
    ],
  )

  return <EventSyncContext.Provider value={value}>{children}</EventSyncContext.Provider>
}
