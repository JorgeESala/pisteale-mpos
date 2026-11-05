import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatUnitCost } from '@/lib/format'
import { fetchInventoryStock } from './queries'
import { formatQty, stockStatusLabels } from './inventory-utils'

const statusClasses = {
  ok: 'bg-green-500/15 text-green-300',
  low: 'bg-yellow-500/15 text-yellow-300',
  out: 'bg-red-500/15 text-red-300',
  no_stock: 'bg-neutral-800 text-neutral-400',
}

export function StockPage() {
  const [search, setSearch] = useState('')

  const stockQuery = useQuery({
    queryKey: ['inventory_stock'],
    queryFn: fetchInventoryStock,
  })

  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX')
  const stock = (stockQuery.data ?? []).filter((item) => item.track_stock)
  const filteredStock = stock.filter((item) => {
    const haystack =
      `${item.name} ${item.group_name} ${item.category_name ?? ''}`.toLocaleLowerCase('es-MX')
    return haystack.includes(normalizedSearch)
  })
  const lowCount = stock.filter((item) => item.stock_status === 'low').length
  const outCount = stock.filter((item) => item.stock_status === 'out').length
  const totalValue = stock.reduce((sum, item) => sum + item.stock_value, 0)

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Insumos</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Stock</h1>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            to="/insumos/compras"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Compras
          </Link>
          <Link
            to="/insumos/movimientos"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Movimientos
          </Link>
          <Link
            to="/insumos"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Insumos
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Valor</p>
          <p className="mt-1 text-lg font-semibold">{formatCurrency(totalValue)}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Bajo mínimo</p>
          <p className="mt-1 text-lg font-semibold text-yellow-300">{lowCount}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Agotados</p>
          <p className="mt-1 text-lg font-semibold text-red-300">{outCount}</p>
        </div>
      </section>

      <input
        type="search"
        placeholder="Buscar marca, grupo o categoría"
        value={search}
        className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
        onChange={(event) => setSearch(event.target.value)}
      />

      {stockQuery.isLoading ? <p className="text-sm text-neutral-500">Cargando stock…</p> : null}

      {stockQuery.isError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {stockQuery.error.message}
        </p>
      ) : null}

      {stockQuery.data ? (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">
            {filteredStock.length} {filteredStock.length === 1 ? 'insumo' : 'insumos'}
          </p>

          {filteredStock.map((item) => (
            <Link
              key={item.item_id}
              to={`/insumos/stock/${item.item_id}`}
              className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-600"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{item.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {item.group_name} · {item.category_name ?? 'Sin categoría'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${statusClasses[item.stock_status]}`}
                >
                  {stockStatusLabels[item.stock_status]}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-400">
                <div>
                  <p className="text-neutral-500">Actual</p>
                  <p className="text-neutral-200">
                    {formatQty(item.stock_qty_base ?? 0, item.base_unit)}
                  </p>
                </div>
                <div>
                  <p className="text-neutral-500">Mínimo</p>
                  <p>{formatQty(item.min_stock_base, item.base_unit)}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Costo promedio</p>
                  <p>
                    {formatUnitCost(item.avg_cost)}
                    <span className="ml-1 text-neutral-500">/{item.base_unit}</span>
                  </p>
                </div>
                <div>
                  <p className="text-neutral-500">Valor</p>
                  <p>{formatCurrency(item.stock_value)}</p>
                </div>
              </div>
            </Link>
          ))}

          {filteredStock.length === 0 ? (
            <p className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
              No hay insumos que coincidan.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
