import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatUnitCost } from '@/lib/format'
import { fetchInventoryItems } from './queries'

export function InventoryItemsPage() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const isAdmin = profile?.role === 'admin'

  const itemsQuery = useQuery({
    queryKey: ['inventory_items'],
    queryFn: fetchInventoryItems,
  })

  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX')
  const filteredItems =
    itemsQuery.data?.filter((item) => {
      const haystack =
        `${item.name} ${item.group_name} ${item.category_name ?? ''}`.toLocaleLowerCase('es-MX')
      return haystack.includes(normalizedSearch)
    }) ?? []

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Catálogo</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Insumos</h1>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            to="/insumos/stock"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Stock
          </Link>
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
            to="/catalogo"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Productos
          </Link>
          <Link
            to="/insumos/grupos"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Grupos
          </Link>
          <Link
            to="/insumos/consumibles"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Consumibles
          </Link>
          <Link
            to="/insumos/hielo"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Hielo del día
          </Link>
          {isAdmin ? (
            <Link
              to="/insumos/nuevo"
              className="rounded-xl bg-brand-400 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-brand-300"
            >
              Nuevo
            </Link>
          ) : null}
        </div>
      </section>

      <input
        type="search"
        placeholder="Buscar marca, grupo o categoría"
        value={search}
        className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
        onChange={(event) => setSearch(event.target.value)}
      />

      {itemsQuery.isLoading ? <p className="text-sm text-neutral-500">Cargando…</p> : null}

      {itemsQuery.isError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {itemsQuery.error.message}
        </p>
      ) : null}

      {itemsQuery.data ? (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">{filteredItems.length} insumos</p>
          {filteredItems.map((item) => (
            <Link
              key={item.id}
              to={`/insumos/${item.id}`}
              className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-600"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{item.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {item.group_name} · {item.category_name ?? 'Sin categoría'}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold">
                  {formatUnitCost(item.avg_cost)}
                  <span className="ml-1 text-[11px] font-normal text-neutral-500">
                    /{item.base_unit}
                  </span>
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                {item.tier ? (
                  <span
                    className={`rounded-full px-2 py-1 ${
                      item.tier === 'premium'
                        ? 'bg-brand-400/15 text-brand-300'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {item.tier === 'premium' ? 'Premium' : 'Estándar'}
                  </span>
                ) : null}
                <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">
                  Compra: {item.purchase_unit} = {item.purchase_factor} {item.base_unit}
                </span>
                <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">
                  Mínimo: {item.min_stock_base} {item.base_unit}
                </span>
                {!item.track_stock ? (
                  <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">
                    No inventariable
                  </span>
                ) : null}
                {!item.active ? (
                  <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">
                    Inactivo
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
