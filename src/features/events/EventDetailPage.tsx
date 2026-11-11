import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatDateTime, formatDate } from '@/features/inventory/inventory-utils'
import { formatCurrency } from '@/lib/format'
import { useOnlineStatus } from '@/lib/use-online-status'
import type { EventExpenseView, EventSaleView, EventStatus } from '@/types/database'
import { EventExpenseForm } from './EventExpenseForm'
import { EventSaleForm } from './EventSaleForm'
import { eventPaymentMethodLabels, eventStatusLabels, expenseCategoryLabels } from './event-labels'
import { calculateEventSaleTotals } from './event-pricing'
import { calculateEventReport } from './event-reporting'
import {
  createEventExpense,
  createEventSale,
  deleteEventExpense,
  deleteEventSale,
  fetchEventBundle,
  fetchEventProducts,
  isConnectivityError,
  setEventStatus,
} from './queries'
import {
  loadPendingEventExpenses,
  loadPendingEventSales,
  markPendingEventExpenseError,
  markPendingEventSaleError,
  removePendingEventExpense,
  removePendingEventSale,
  type PendingEventExpense,
  type PendingEventSale,
} from './offline-queue'

type SaleRow = { kind: 'saved'; sale: EventSaleView } | { kind: 'pending'; sale: PendingEventSale }

type ExpenseRow =
  { kind: 'saved'; expense: EventExpenseView } | { kind: 'pending'; expense: PendingEventExpense }

function dateValue(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const eventId = id ?? ''
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const online = useOnlineStatus()
  const canOperate = profile?.role === 'admin' || profile?.role === 'operador'
  const isAdmin = profile?.role === 'admin'

  const bundleQuery = useQuery({
    queryKey: ['event_bundle', eventId],
    queryFn: () => fetchEventBundle(eventId),
    enabled: Boolean(eventId),
  })

  const productsQuery = useQuery({
    queryKey: ['event_products'],
    queryFn: fetchEventProducts,
  })

  const [pendingSales, setPendingSales] = useState<PendingEventSale[]>([])
  const [pendingExpenses, setPendingExpenses] = useState<PendingEventExpense[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [offlineReady, setOfflineReady] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const syncingRef = useRef(false)

  const refreshPending = useCallback(() => {
    const nextSales = loadPendingEventSales().filter((sale) => sale.eventId === eventId)
    const nextExpenses = loadPendingEventExpenses().filter((expense) => expense.eventId === eventId)

    setPendingSales((current) => (sameQueue(current, nextSales) ? current : nextSales))
    setPendingExpenses((current) => (sameQueue(current, nextExpenses) ? current : nextExpenses))
  }, [eventId])

  useEffect(() => {
    queueMicrotask(refreshPending)
  }, [refreshPending])

  const invalidateEvent = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['event_bundle', eventId] })
    void queryClient.invalidateQueries({ queryKey: ['events'] })
  }, [eventId, queryClient])

  const syncPending = useCallback(async () => {
    if (syncingRef.current || !online) return
    if (pendingSales.length === 0 && pendingExpenses.length === 0) return

    syncingRef.current = true
    setSyncing(true)
    setSyncError(null)

    try {
      for (const sale of pendingSales.filter((item) => item.status === 'pending')) {
        try {
          await createEventSaleFromQueue(sale)
          removePendingEventSale(sale.clientId)
        } catch (error) {
          if (isConnectivityError(error)) {
            break
          }

          const message =
            error instanceof Error ? error.message : 'No se pudo sincronizar una venta.'
          markPendingEventSaleError(sale.clientId, message)
          setSyncError(message)
          break
        }
      }

      for (const expense of pendingExpenses.filter((item) => item.status === 'pending')) {
        try {
          await createEventExpenseFromQueue(expense)
          removePendingEventExpense(expense.clientId)
        } catch (error) {
          if (isConnectivityError(error)) {
            break
          }

          const message =
            error instanceof Error ? error.message : 'No se pudo sincronizar un gasto.'
          markPendingEventExpenseError(expense.clientId, message)
          setSyncError(message)
          break
        }
      }
    } finally {
      syncingRef.current = false
      setSyncing(false)
      refreshPending()
      invalidateEvent()
    }
  }, [invalidateEvent, online, pendingExpenses, pendingSales, refreshPending])

  const pendingSaleCount = pendingSales.filter((sale) => sale.status === 'pending').length
  const pendingExpenseCount = pendingExpenses.filter(
    (expense) => expense.status === 'pending',
  ).length

  useEffect(() => {
    if (!online) return
    if (pendingSaleCount === 0 && pendingExpenseCount === 0) return

    queueMicrotask(() => {
      void syncPending()
    })
    const interval = window.setInterval(() => {
      void syncPending()
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [online, pendingExpenseCount, pendingSaleCount, syncPending])

  const statusMutation = useMutation({
    mutationFn: (status: EventStatus) => setEventStatus(eventId, status),
    onSuccess: () => {
      setActionError(null)
      invalidateEvent()
    },
    onError: (error) => setActionError(error.message),
  })

  const deleteSaleMutation = useMutation({
    mutationFn: deleteEventSale,
    onSuccess: () => {
      setActionError(null)
      invalidateEvent()
    },
    onError: (error) => setActionError(error.message),
  })

  const deleteExpenseMutation = useMutation({
    mutationFn: deleteEventExpense,
    onSuccess: () => {
      setActionError(null)
      invalidateEvent()
    },
    onError: (error) => setActionError(error.message),
  })

  function handleSaleSaved(pending: boolean) {
    refreshPending()
    if (!pending) {
      invalidateEvent()
    }
  }

  function handleExpenseSaved(pending: boolean) {
    refreshPending()
    if (!pending) {
      invalidateEvent()
    }
  }

  async function prepareOffline() {
    if (!online) {
      setActionError('Conéctate a internet para preparar el modo offline.')
      return
    }

    setActionError(null)
    setOfflineReady(false)

    try {
      await Promise.all([bundleQuery.refetch(), productsQuery.refetch()])

      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        await navigator.storage.persist()
      }

      setOfflineReady(true)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'No se pudo preparar el modo offline.',
      )
    }
  }

  function handleDeletePendingSale(sale: PendingEventSale) {
    if (!window.confirm('¿Eliminar esta venta pendiente?')) return

    removePendingEventSale(sale.clientId)
    refreshPending()
  }

  function handleDeleteSavedSale(sale: EventSaleView) {
    if (!window.confirm('¿Eliminar esta venta? Esta acción no se puede deshacer.')) return

    deleteSaleMutation.mutate(sale.id)
  }

  function handleDeletePendingExpense(expense: PendingEventExpense) {
    if (!window.confirm('¿Eliminar este gasto pendiente?')) return

    removePendingEventExpense(expense.clientId)
    refreshPending()
  }

  function handleDeleteSavedExpense(expense: EventExpenseView) {
    if (!window.confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.')) return

    deleteExpenseMutation.mutate(expense.id)
  }

  if (!eventId) {
    return <p className="text-sm text-red-300">Evento no encontrado.</p>
  }

  if (bundleQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando evento…</p>
  }

  if (bundleQuery.isError || !bundleQuery.data) {
    return (
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h1 className="font-semibold">Evento no disponible</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {bundleQuery.error?.message ?? 'No se encontró el evento.'}
        </p>
        <Link to="/eventos" className="mt-4 inline-flex text-sm text-neutral-300 underline">
          Volver a eventos
        </Link>
      </section>
    )
  }

  const bundle = bundleQuery.data
  const event = bundle.event
  const report = calculateEventReport(bundle, pendingSales, pendingExpenses)
  const products = productsQuery.data ?? []

  const saleRows: SaleRow[] = [
    ...bundle.sales.map((sale) => ({ kind: 'saved' as const, sale })),
    ...pendingSales.map((sale) => ({ kind: 'pending' as const, sale })),
  ].sort((left, right) => {
    const leftDate = left.kind === 'saved' ? left.sale.sold_at : left.sale.soldAt
    const rightDate = right.kind === 'saved' ? right.sale.sold_at : right.sale.soldAt
    return dateValue(rightDate) - dateValue(leftDate)
  })

  const expenseRows: ExpenseRow[] = [
    ...bundle.expenses.map((expense) => ({ kind: 'saved' as const, expense })),
    ...pendingExpenses.map((expense) => ({ kind: 'pending' as const, expense })),
  ].sort((left, right) => {
    const leftDate = left.kind === 'saved' ? left.expense.spent_at : left.expense.spentAt
    const rightDate = right.kind === 'saved' ? right.expense.spent_at : right.expense.spentAt
    return dateValue(rightDate) - dateValue(leftDate)
  })

  const pendingTotal = pendingSales.length + pendingExpenses.length

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-neutral-500">{event.folio}</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{event.name}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {formatDate(event.event_date)}
            {event.start_time ? ` · ${event.start_time.slice(0, 5)}` : ''}
            {event.end_time ? ` a ${event.end_time.slice(0, 5)}` : ''}
            {event.venue ? ` · ${event.venue}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={`rounded-full px-2 py-1 text-[11px] ${
              event.status === 'open'
                ? 'bg-green-500/15 text-green-300'
                : 'bg-neutral-700/50 text-neutral-300'
            }`}
          >
            {eventStatusLabels[event.status]}
          </span>
          <Link
            to={`/eventos/${event.id}/editar`}
            className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300"
          >
            Editar
          </Link>
        </div>
      </section>

      {!online ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Sin conexión. Las ventas y gastos se guardan en el teléfono y se sincronizan al volver la
          señal.
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-[11px] text-neutral-500">Ventas netas</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(report.salesTotal)}</p>
          <p className="mt-1 text-[11px] text-neutral-500">
            {report.salesCount} {report.salesCount === 1 ? 'venta' : 'ventas'} ·{' '}
            {report.drinksCount} {report.drinksCount === 1 ? 'bebida' : 'bebidas'}
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-[11px] text-neutral-500">Gastos</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(report.expensesTotal)}</p>
          <p className="mt-1 text-[11px] text-neutral-500">
            {report.expensesCount} {report.expensesCount === 1 ? 'gasto' : 'gastos'}
          </p>
        </div>

        <div className="col-span-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] text-neutral-500">
                {event.status === 'open' ? 'Utilidad parcial' : 'Utilidad final'}
              </p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  report.profit >= 0 ? 'text-green-300' : 'text-red-300'
                }`}
              >
                {formatCurrency(report.profit)}
              </p>
            </div>
            <div className="text-right text-[11px] text-neutral-500">
              <p>Margen: {report.marginPercent === null ? '—' : `${report.marginPercent}%`}</p>
              <p>Descuentos: {formatCurrency(report.discountTotal)}</p>
              <p>Efectivo esperado: {formatCurrency(report.cashExpected)}</p>
            </div>
          </div>
        </div>
      </section>

      {pendingTotal > 0 ? (
        <section className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">Pendiente de sincronizar</p>
              <p className="mt-1 text-xs text-amber-200">
                {pendingSales.length} {pendingSales.length === 1 ? 'venta' : 'ventas'} ·{' '}
                {pendingExpenses.length} {pendingExpenses.length === 1 ? 'gasto' : 'gastos'} en este
                teléfono.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void syncPending()}
              disabled={!online || syncing}
              className="shrink-0 rounded-lg border border-amber-400/40 px-2 py-1 text-xs text-amber-100 disabled:opacity-60"
            >
              {syncing ? 'Sincronizando…' : 'Sincronizar'}
            </button>
          </div>
          {syncError ? <p className="text-xs text-red-200">{syncError}</p> : null}
        </section>
      ) : null}

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void prepareOffline()}
          disabled={!online}
          className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300 disabled:opacity-60"
        >
          Preparar modo offline
        </button>
        {canOperate ? (
          <button
            type="button"
            onClick={() => statusMutation.mutate(event.status === 'open' ? 'closed' : 'open')}
            disabled={statusMutation.isPending}
            className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300 disabled:opacity-60"
          >
            {statusMutation.isPending
              ? 'Guardando…'
              : event.status === 'open'
                ? 'Cerrar evento'
                : 'Reabrir evento'}
          </button>
        ) : null}
      </section>

      {offlineReady ? (
        <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
          Evento y catálogo guardados. Puedes usar esta pantalla sin conexión.
        </p>
      ) : null}

      {actionError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {actionError}
        </p>
      ) : null}

      {report.salesCount > 0 || report.expensesCount > 0 ? (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-semibold">Desglose por pago</h2>
          <div className="mt-3 space-y-2 text-sm">
            {Object.entries(eventPaymentMethodLabels).map(([method, label]) => {
              const row = report.paymentBreakdown[method as keyof typeof report.paymentBreakdown]
              if (row.sales === 0 && row.expenses === 0) return null

              return (
                <div key={method} className="flex items-center justify-between gap-3">
                  <span className="text-neutral-400">{label}</span>
                  <span className="text-neutral-200">
                    Ventas {formatCurrency(row.sales)} · Gastos {formatCurrency(row.expenses)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {canOperate && event.status === 'open' ? (
        <EventSaleForm
          event={event}
          products={products}
          online={online}
          onSaleSaved={handleSaleSaved}
        />
      ) : null}

      {canOperate && event.status === 'closed' ? (
        <p className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-400">
          El evento está cerrado. Reábrelo para registrar más ventas. Aún puedes agregar gastos.
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-semibold">Ventas</h2>
          <p className="text-xs text-neutral-500">{saleRows.length}</p>
        </div>

        {saleRows.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay ventas registradas.</p>
        ) : null}

        {saleRows.map((row) => {
          if (row.kind === 'pending') {
            return (
              <article
                key={`pending-${row.sale.clientId}`}
                className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-amber-100">
                      {formatDateTime(row.sale.soldAt)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-200">
                      Pendiente · {eventPaymentMethodLabels[row.sale.paymentMethod]}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-amber-100">
                      {formatCurrency(
                        calculateEventSaleTotals(row.sale.items, {
                          enabled: event.promotion_enabled && row.sale.applyPromotion,
                          bundleQty: event.bundle_qty,
                          bundlePrice: event.bundle_price,
                        }).total,
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleDeletePendingSale(row.sale)}
                      className="mt-1 text-[11px] text-red-200 underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-amber-200">
                  {row.sale.items
                    .map((item) => `${item.quantity} × ${item.productName}`)
                    .join(' · ')}
                </p>
                {row.sale.status === 'error' && row.sale.error ? (
                  <p className="mt-2 text-xs text-red-200">{row.sale.error}</p>
                ) : null}
              </article>
            )
          }

          const items = bundle.saleItems.filter((item) => item.event_sale_id === row.sale.id)

          return (
            <article
              key={row.sale.id}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{formatDateTime(row.sale.sold_at)}</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {eventPaymentMethodLabels[row.sale.payment_method]}
                    {row.sale.discount_total > 0
                      ? ` · Descuento ${formatCurrency(row.sale.discount_total)}`
                      : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(row.sale.total)}</p>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteSavedSale(row.sale)}
                      className="mt-1 text-[11px] text-red-300 underline"
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                {items.map((item) => `${item.quantity} × ${item.product_name}`).join(' · ')}
              </p>
            </article>
          )
        })}
      </section>

      {canOperate ? (
        <EventExpenseForm event={event} online={online} onExpenseSaved={handleExpenseSaved} />
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-semibold">Gastos</h2>
          <p className="text-xs text-neutral-500">{expenseRows.length}</p>
        </div>

        {expenseRows.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay gastos registrados.</p>
        ) : null}

        {expenseRows.map((row) => {
          if (row.kind === 'pending') {
            return (
              <article
                key={`pending-${row.expense.clientId}`}
                className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-amber-100">{row.expense.description}</p>
                    <p className="mt-0.5 text-[11px] text-amber-200">
                      {expenseCategoryLabels[row.expense.category]} ·{' '}
                      {eventPaymentMethodLabels[row.expense.paymentMethod]} · Pendiente
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-amber-100">
                      {formatCurrency(row.expense.amount)}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleDeletePendingExpense(row.expense)}
                      className="mt-1 text-[11px] text-red-200 underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            )
          }

          return (
            <article
              key={row.expense.id}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.expense.description}</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {expenseCategoryLabels[row.expense.category]} ·{' '}
                    {eventPaymentMethodLabels[row.expense.payment_method]} ·{' '}
                    {formatDateTime(row.expense.spent_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(row.expense.amount)}</p>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteSavedExpense(row.expense)}
                      className="mt-1 text-[11px] text-red-300 underline"
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

function sameQueue<T>(left: T[], right: T[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function createEventSaleFromQueue(sale: PendingEventSale) {
  return createEventSale({
    clientId: sale.clientId,
    eventId: sale.eventId,
    items: sale.items,
    applyPromotion: sale.applyPromotion,
    paymentMethod: sale.paymentMethod,
    notes: sale.notes,
    soldAt: sale.soldAt,
  })
}

function createEventExpenseFromQueue(expense: PendingEventExpense) {
  return createEventExpense({
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
