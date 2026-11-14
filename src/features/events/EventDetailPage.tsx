import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatDateTime } from '@/features/inventory/inventory-utils'
import { formatCurrency } from '@/lib/format'
import { useOnlineStatus } from '@/lib/use-online-status'
import type { EventExpenseView, EventSaleView, EventStatus } from '@/types/database'
import { EventExpenseForm } from './EventExpenseForm'
import { EventSaleForm } from './EventSaleForm'
import { useEventSync } from './event-sync-context'
import { eventPaymentMethodLabels, eventStatusLabels, expenseCategoryLabels } from './event-labels'
import { formatEventSchedule } from './event-datetime'
import { calculateEventReport, pendingSaleTotals } from './event-reporting'
import { prepareEventOffline } from './prepare-offline'
import {
  deleteEventExpense,
  deleteEventSale,
  fetchEventBundle,
  fetchEventFinanceEdits,
  fetchEventProducts,
  fetchEvents,
  setEventStatus,
} from './queries'
import {
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
  const userId = profile?.id ?? null
  const online = useOnlineStatus()
  const canOperate = profile?.role === 'admin' || profile?.role === 'operador'
  const canEdit = Boolean(profile)
  const isAdmin = profile?.role === 'admin'
  const { pendingSales, pendingExpenses, refresh: refreshPending } = useEventSync()

  const bundleQuery = useQuery({
    queryKey: ['event_bundle', eventId],
    queryFn: () => fetchEventBundle(userId!, eventId),
    enabled: Boolean(eventId && userId),
  })

  const productsQuery = useQuery({
    queryKey: ['event_products'],
    queryFn: () => fetchEventProducts(userId!),
    enabled: Boolean(userId),
  })

  const [offlineReady, setOfflineReady] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editingExpense, setEditingExpense] = useState<EventExpenseView | null>(null)

  const eventPendingSales = pendingSales.filter((sale) => sale.eventId === eventId)
  const eventPendingExpenses = pendingExpenses.filter((expense) => expense.eventId === eventId)

  const financeEditsQuery = useQuery({
    queryKey: ['event_finance_edits', eventId],
    queryFn: () => fetchEventFinanceEdits(eventId),
    enabled: Boolean(eventId && online),
  })

  const invalidateEvent = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['event_bundle', eventId] })
    void queryClient.invalidateQueries({ queryKey: ['events'] })
    void queryClient.invalidateQueries({ queryKey: ['event_finance_edits', eventId] })
  }, [eventId, queryClient])

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
    if (!online || !userId) {
      setActionError('Conéctate a internet para preparar el modo offline.')
      return
    }

    setActionError(null)
    setOfflineReady(false)

    const result = await prepareEventOffline({
      userId,
      eventId,
      refetchBundle: () => bundleQuery.refetch(),
      refetchProducts: () => productsQuery.refetch(),
      fetchEvents: () => fetchEvents(userId),
      persist:
        typeof navigator !== 'undefined' && navigator.storage?.persist
          ? () => navigator.storage.persist()
          : undefined,
    })

    if (!result.ok) {
      setActionError(result.message)
      return
    }

    setOfflineReady(true)
  }

  function handleDeletePendingSale(sale: PendingEventSale) {
    if (!userId) return
    if (!window.confirm('¿Eliminar esta venta pendiente?')) return

    removePendingEventSale(userId, sale.clientId)
    refreshPending()
  }

  function handleDeleteSavedSale(sale: EventSaleView) {
    if (!window.confirm('¿Eliminar esta venta? Esta acción no se puede deshacer.')) return

    deleteSaleMutation.mutate(sale.id)
  }

  function handleDeletePendingExpense(expense: PendingEventExpense) {
    if (!userId) return
    if (!window.confirm('¿Eliminar este gasto pendiente?')) return

    removePendingEventExpense(userId, expense.clientId)
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
  const report = calculateEventReport(bundle, eventPendingSales, eventPendingExpenses)
  const products = productsQuery.data ?? []

  const saleRows: SaleRow[] = [
    ...bundle.sales.map((sale) => ({ kind: 'saved' as const, sale })),
    ...eventPendingSales.map((sale) => ({ kind: 'pending' as const, sale })),
  ].sort((left, right) => {
    const leftDate = left.kind === 'saved' ? left.sale.sold_at : left.sale.soldAt
    const rightDate = right.kind === 'saved' ? right.sale.sold_at : right.sale.soldAt
    return dateValue(rightDate) - dateValue(leftDate)
  })

  const expenseRows: ExpenseRow[] = [
    ...bundle.expenses.map((expense) => ({ kind: 'saved' as const, expense })),
    ...eventPendingExpenses.map((expense) => ({ kind: 'pending' as const, expense })),
  ].sort((left, right) => {
    const leftDate = left.kind === 'saved' ? left.expense.spent_at : left.expense.spentAt
    const rightDate = right.kind === 'saved' ? right.expense.spent_at : right.expense.spentAt
    return dateValue(rightDate) - dateValue(leftDate)
  })

  function toggleStatus() {
    if (event.status === 'open' && eventPendingSales.length > 0) {
      setActionError('Sincroniza las ventas pendientes antes de cerrar el evento.')
      return
    }

    statusMutation.mutate(event.status === 'open' ? 'closed' : 'open')
  }

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-neutral-500">{event.folio}</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{event.name}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {formatEventSchedule(event)}
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
            to={`/eventos/${event.id}/inventario`}
            className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300"
          >
            Inventario
          </Link>
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

      {event.status === 'closed' && eventPendingSales.length > 0 ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Hay ventas pendientes de sincronizar. Reabre el evento para poder sincronizarlas.
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
            onClick={toggleStatus}
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
            const totals = pendingSaleTotals(row.sale)

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
                    <p className="font-semibold text-amber-100">{formatCurrency(totals.total)}</p>
                    {totals.limitExceeded ? (
                      <p className="text-[11px] text-red-200">Límite inválido</p>
                    ) : null}
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

      {canOperate && !editingExpense ? (
        <EventExpenseForm event={event} online={online} onExpenseSaved={handleExpenseSaved} />
      ) : null}

      {editingExpense ? (
        <EventExpenseForm
          key={editingExpense.id}
          event={event}
          online={online}
          expense={editingExpense}
          onExpenseSaved={handleExpenseSaved}
          onCancelEdit={() => setEditingExpense(null)}
        />
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
                  {row.expense.updated_by_name ? (
                    <p className="mt-0.5 text-[11px] text-amber-200/80">
                      Editado por {row.expense.updated_by_name} ·{' '}
                      {formatDateTime(row.expense.updated_at)}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(row.expense.amount)}</p>
                  {canEdit ? (
                    row.expense.inventory_load_id ? (
                      <Link
                        to={`/eventos/${event.id}/inventario`}
                        className="mt-1 inline-flex text-[11px] text-brand-300 underline"
                      >
                        Editar carga
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingExpense(row.expense)}
                        disabled={!online}
                        className="mt-1 text-[11px] text-neutral-300 underline disabled:opacity-40"
                      >
                        Editar
                      </button>
                    )
                  ) : null}
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteSavedExpense(row.expense)}
                      className="mt-1 ml-2 text-[11px] text-red-300 underline"
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

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-semibold">Historial de cambios</h2>
          <p className="text-xs text-neutral-500">{financeEditsQuery.data?.length ?? 0}</p>
        </div>
        {!online ? (
          <p className="text-sm text-neutral-500">
            Conéctate a internet para consultar el historial de cambios.
          </p>
        ) : null}
        {financeEditsQuery.isError ? (
          <p className="text-sm text-red-300">{financeEditsQuery.error.message}</p>
        ) : null}
        {online && financeEditsQuery.data?.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay cambios registrados.</p>
        ) : null}
        {(financeEditsQuery.data ?? []).map((edit) => (
          <article
            key={edit.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{edit.summary}</p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {edit.edited_by_name ?? 'Usuario eliminado'} · {formatDateTime(edit.edited_at)}
                </p>
              </div>
              <span className="rounded-full bg-neutral-800 px-2 py-1 text-[10px] text-neutral-400">
                {edit.entity_type === 'inventory_load' ? 'Carga' : 'Gasto'}
              </span>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
