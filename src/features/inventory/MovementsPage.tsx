import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '@/lib/format'
import type { InventoryMovementType } from '@/types/database'
import { fetchInventoryMovements } from './queries'
import { formatDateTime, formatQty, movementLabels } from './inventory-utils'

const movementClasses: Record<string, string> = {
  purchase: 'bg-blue-500/15 text-blue-300',
  adjustment: 'bg-yellow-500/15 text-yellow-300',
  opening: 'bg-purple-500/15 text-purple-300',
  consumption: 'bg-orange-500/15 text-orange-300',
  waste: 'bg-red-500/15 text-red-300',
  transfer: 'bg-neutral-800 text-neutral-400',
}

export function MovementsPage() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState<'all' | InventoryMovementType>('all')

  const movementsQuery = useQuery({
    queryKey: ['inventory_movements'],
    queryFn: () => fetchInventoryMovements(undefined, 100),
  })

  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX')
  const movements = movementsQuery.data ?? []
  const filtered = movements.filter((movement) => {
    const haystack =
      `${movement.item_name} ${movement.group_name} ${movement.notes} ${movement.purchase_folio ?? ''}`.toLocaleLowerCase(
        'es-MX',
      )
    const matchesSearch = haystack.includes(normalizedSearch)
    const matchesType = type === 'all' || movement.movement_type === type

    return matchesSearch && matchesType
  })

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Insumos</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Movimientos</h1>
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
        </div>
      </section>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          type="search"
          placeholder="Buscar insumo, nota o folio"
          value={search}
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          value={type}
          className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-sm text-neutral-200 outline-none transition focus:border-brand-400"
          onChange={(event) => setType(event.target.value as 'all' | InventoryMovementType)}
        >
          <option value="all">Todos</option>
          {Object.entries(movementLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {movementsQuery.isLoading ? (
        <p className="text-sm text-neutral-500">Cargando movimientos…</p>
      ) : null}

      {movementsQuery.isError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {movementsQuery.error.message}
        </p>
      ) : null}

      {movementsQuery.data ? (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">
            {filtered.length} {filtered.length === 1 ? 'movimiento' : 'movimientos'}
          </p>

          {filtered.map((movement) => (
            <article
              key={movement.id}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[11px] ${
                        movementClasses[movement.movement_type] ?? movementClasses.transfer
                      }`}
                    >
                      {movementLabels[movement.movement_type]}
                    </span>
                    <Link
                      to={`/insumos/stock/${movement.item_id}`}
                      className="truncate text-sm font-semibold text-brand-300 underline"
                    >
                      {movement.item_name}
                    </Link>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {movement.group_name} · {formatDateTime(movement.occurred_at)}
                  </p>
                </div>
                <p className="shrink-0 text-right text-sm font-semibold">
                  <span className={movement.qty_base > 0 ? 'text-green-300' : 'text-red-300'}>
                    {movement.qty_base > 0 ? '+' : ''}
                    {formatQty(movement.qty_base, movement.base_unit)}
                  </span>
                  <span className="block text-[11px] font-normal text-neutral-500">
                    {formatCurrency(movement.total_cost)}
                  </span>
                </p>
              </div>

              {movement.notes ? (
                <p className="mt-2 text-sm text-neutral-400">{movement.notes}</p>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-neutral-500">
                {movement.purchase_folio ? (
                  <Link
                    to={`/insumos/compras/${movement.purchase_id}`}
                    className="text-brand-300 underline"
                  >
                    {movement.purchase_folio}
                  </Link>
                ) : null}
                {movement.created_by_name ? <span>{movement.created_by_name}</span> : null}
              </div>
            </article>
          ))}

          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
              No hay movimientos que coincidan.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
