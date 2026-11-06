import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { formatCurrency } from '@/lib/format'
import type { PaymentMethod } from '@/types/database'
import { formatDateTime } from '@/features/inventory/inventory-utils'
import {
  fetchOrder,
  fetchOrderItems,
  fetchOrderPromotions,
  fetchPayments,
  parseSaleWarnings,
} from './queries'
import { warningText } from './sales-warnings'

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
}

const tierLabels: Record<string, string> = {
  normal: 'Normal',
  premium: 'Premium',
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(id!),
    enabled: Boolean(id),
  })

  const itemsQuery = useQuery({
    queryKey: ['order_items', id],
    queryFn: () => fetchOrderItems(id!),
    enabled: Boolean(id),
  })

  const paymentsQuery = useQuery({
    queryKey: ['order_payments', id],
    queryFn: () => fetchPayments(id!),
    enabled: Boolean(id),
  })

  const promotionsQuery = useQuery({
    queryKey: ['order_promotions', id],
    queryFn: () => fetchOrderPromotions(id!),
    enabled: Boolean(id),
  })

  if (!id) {
    return <p className="text-sm text-red-300">Pedido no encontrado.</p>
  }

  if (
    orderQuery.isLoading ||
    itemsQuery.isLoading ||
    paymentsQuery.isLoading ||
    promotionsQuery.isLoading
  ) {
    return <p className="text-sm text-neutral-500">Cargando pedido…</p>
  }

  if (
    orderQuery.isError ||
    itemsQuery.isError ||
    paymentsQuery.isError ||
    promotionsQuery.isError
  ) {
    const error =
      orderQuery.error ?? itemsQuery.error ?? paymentsQuery.error ?? promotionsQuery.error
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error?.message}
      </p>
    )
  }

  const order = orderQuery.data

  if (!order) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">No se encontró el pedido.</p>
        <Link to="/pedidos" className="text-sm text-brand-300 underline">
          Volver a pedidos
        </Link>
      </div>
    )
  }

  const warnings = parseSaleWarnings(order.inventory_warnings)
  const items = itemsQuery.data ?? []
  const payments = paymentsQuery.data ?? []
  const promotions = promotionsQuery.data ?? []
  const paymentLabel = order.payment_methods
    ? order.payment_methods
        .split(', ')
        .map((method) => paymentMethodLabels[method as PaymentMethod] ?? method)
        .join(', ')
    : '—'

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Ticket</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{order.folio}</h1>
          <p className="mt-1 text-sm text-neutral-500">{formatDateTime(order.sold_at)}</p>
        </div>
        <Link
          to="/pedidos"
          className="shrink-0 rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
        >
          Volver
        </Link>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-neutral-500">Total cobrado</p>
            <p className="mt-1 text-3xl font-semibold">{formatCurrency(order.total)}</p>
            <p className="mt-1 text-xs text-neutral-500">
              Lista {formatCurrency(order.gross_total)} · descuento{' '}
              {formatCurrency(order.discount_total)} · subtotal {formatCurrency(order.subtotal)} ·
              propina {formatCurrency(order.tip_total)}
            </p>
          </div>
          <span className="rounded-full bg-brand-400/15 px-2 py-1 text-[11px] text-brand-300">
            {order.status === 'paid' ? 'Pagado' : 'Cancelado'}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-neutral-500">Costo</p>
            <p>{order.cost_total === null ? 'Pendiente' : formatCurrency(order.cost_total)}</p>
          </div>
          <div>
            <p className="text-neutral-500">Margen</p>
            <p>{order.margin === null ? 'Pendiente' : formatCurrency(order.margin)}</p>
          </div>
          <div>
            <p className="text-neutral-500">Cobró</p>
            <p>{order.created_by_name ?? '—'}</p>
          </div>
          <div>
            <p className="text-neutral-500">Pago</p>
            <p>{paymentLabel}</p>
          </div>
        </div>

        {order.notes ? (
          <p className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
            {order.notes}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Productos</h2>

        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{item.product_name}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {tierLabels[item.tier] ?? item.tier} · {item.quantity} ×{' '}
                  {formatCurrency(item.unit_price)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold">{formatCurrency(item.line_total)}</p>
            </div>

            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-neutral-500">
              <span>
                Costo: {item.line_cost === null ? 'Pendiente' : formatCurrency(item.line_cost)}
              </span>
              <span>
                Margen:{' '}
                {item.line_cost === null
                  ? 'Pendiente'
                  : formatCurrency(item.line_total - item.line_cost)}
              </span>
            </div>

            {item.notes ? <p className="mt-2 text-sm text-neutral-400">{item.notes}</p> : null}
          </article>
        ))}
      </section>

      {promotions.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-semibold">Promociones</h2>
          {promotions.map((promotion) => (
            <div key={promotion.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-neutral-400">
                {promotion.promotion_name} · {promotion.applications}{' '}
                {promotion.applications === 1 ? 'aplicación' : 'aplicaciones'} ·{' '}
                {promotion.automatic ? 'automática' : 'manual'}
              </span>
              <span className="font-medium text-green-300">
                -{formatCurrency(promotion.discount_amount)}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {warnings.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="font-semibold text-amber-200">Advertencias de inventario</h2>
          <ul className="mt-2 space-y-2 text-sm text-amber-100">
            {warnings.map((warning, index) => (
              <li key={`${warning.type}-${index}`}>{warningText(warning)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-semibold">Pagos</h2>
        {payments.map((payment) => (
          <div
            key={payment.id}
            className="flex items-start justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm"
          >
            <div>
              <p className="font-medium">{paymentMethodLabels[payment.method] ?? payment.method}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {formatDateTime(payment.paid_at)}
                {payment.reference ? ` · ${payment.reference}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatCurrency(payment.amount)}</p>
              <p className="text-[11px] text-neutral-500">
                Propina {formatCurrency(payment.tip_amount)}
              </p>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
