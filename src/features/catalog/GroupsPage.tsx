import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { fetchInventoryGroups } from './queries'

export function GroupsPage() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const canManageCatalog = profile?.role === 'admin' || profile?.can_manage_catalog === true

  const groupsQuery = useQuery({
    queryKey: ['inventory_groups'],
    queryFn: fetchInventoryGroups,
  })

  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX')
  const filteredGroups =
    groupsQuery.data?.filter((group) => {
      const haystack = `${group.name} ${group.category_name ?? ''}`.toLocaleLowerCase('es-MX')
      return haystack.includes(normalizedSearch)
    }) ?? []

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Catálogo</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Grupos de insumos</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to="/insumos"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Insumos
          </Link>
          {canManageCatalog ? (
            <Link
              to="/insumos/grupos/nuevo"
              className="rounded-xl bg-brand-400 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-brand-300"
            >
              Nuevo
            </Link>
          ) : null}
        </div>
      </section>

      <input
        type="search"
        placeholder="Buscar grupo o categoría"
        value={search}
        className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
        onChange={(event) => setSearch(event.target.value)}
      />

      {groupsQuery.isLoading ? <p className="text-sm text-neutral-500">Cargando…</p> : null}

      {groupsQuery.isError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {groupsQuery.error.message}
        </p>
      ) : null}

      {groupsQuery.data ? (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">{filteredGroups.length} grupos</p>
          {filteredGroups.map((group) => (
            <Link
              key={group.group_id}
              to={`/insumos/grupos/${group.group_id}`}
              className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-600"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{group.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {group.category_name ?? 'Sin categoría'} · {group.base_unit}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-neutral-800 px-2 py-1 text-[11px] text-neutral-400">
                  {group.item_count} insumos
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span
                  className={`rounded-full px-2 py-1 ${
                    group.is_tiered
                      ? 'bg-brand-400/15 text-brand-300'
                      : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {group.is_tiered ? 'Tiered' : 'Sin tier'}
                </span>
                {group.is_tiered ? (
                  <>
                    <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">
                      Estándar con costo: {group.standard_cost_count}
                    </span>
                    <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">
                      Premium con costo: {group.premium_cost_count}
                    </span>
                  </>
                ) : (
                  <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">
                    Con costo: {group.all_cost_count}
                  </span>
                )}
                {!group.active ? (
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
