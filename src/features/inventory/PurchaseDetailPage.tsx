import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { formatCurrency, formatUnitCost } from '@/lib/format'
import { fetchPurchase, fetchPurchaseItems } from './queries'
import { formatDate, formatQty } from './inventory-utils'

export function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>()

  const purchaseQuery = useQuery({
    queryKey: ['purchase', id],
    queryFn: () => fetchPurchase(id!),
    enabled: Boolean(id),
  })

  const itemsQuery = useQuery({
    queryKey: ['purchase_items', id],
    queryFn: () => fetchPurchaseItems(id!),
    enabled: Boolean(id),
  })

  if (!id) {
    return <p className="text-sm text-red-300">Compra no encontrada.</p>
  }

  if (purchaseQuery.isLoading || itemsQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando compra…</p>
  }

  if (purchaseQuery.isError || itemsQuery.isError) {
    const error = purchaseQuery.error ?? itemsQuery.error
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error?.message}
      </p>
    )
  }

  const purchase = purchaseQuery.data

  if (!purchase) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">No se encontró la compra.</p>
        <Link to="/insumos/compras" className="text-sm text-brand-300 underline">
          Volver a compras
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Compra</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{purchase.folio}</h1>
          <p className="mt-1 text-sm text-neutral-500">{formatDate(purchase.purchase_date)}</p>
        </div>
        <Link
          to="/insumos/compras"
          className="shrink-0 rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
        >
          Volver
        </Link>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-neutral-500">Total</p>
            <p className="mt-1 text-3xl font-semibold">{formatCurrency(purchase.total_cost)}</p>
          </div>
          <p className="text-xs text-neutral-500">
            {purchase.item_count} {purchase.item_count === 1 ? 'insumo' : 'insumos'}
          </p>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-neutral-500">Proveedor</dt>
            <dd>{purchase.supplier || '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-neutral-500">Factura</dt>
            <dd>{purchase.invoice_ref || '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-neutral-500">Registró</dt>
            <dd>{purchase.created_by_name ?? '—'}</dd>
          </div>
        </dl>

        {purchase.notes ? (
          <p className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
            {purchase.notes}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Detalle</h2>

        {itemsQuery.data?.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  to={`/insumos/stock/${item.item_id}`}
                  className="truncate font-semibold text-brand-300 underline"
                >
                  {item.item_name}
                </Link>
                <p className="mt-0.5 text-xs text-neutral-500">{item.group_name}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold">{formatCurrency(item.total_cost)}</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-400">
              <div>
                <p className="text-neutral-500">Cantidad</p>
                <p>{formatQty(item.qty_purchase, item.purchase_unit)}</p>
              </div>
              <div>
                <p className="text-neutral-500">Equivalente</p>
                <p>{formatQty(item.qty_base, item.base_unit)}</p>
              </div>
              <div>
                <p className="text-neutral-500">Costo por {item.purchase_unit}</p>
                <p>{formatCurrency(item.total_cost / item.qty_purchase)}</p>
              </div>
              <div>
                <p className="text-neutral-500">Costo por {item.base_unit}</p>
                <p>{formatUnitCost(item.unit_cost_base)}</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
