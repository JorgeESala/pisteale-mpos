import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatUnitCost } from '@/lib/format'
import type { InventoryItemView } from '@/types/database'
import {
  formatPackagePrice,
  packagePresentationLabel,
  packagePriceToUnitCost,
  parsePackagePriceInput,
} from './inventory-pricing'
import {
  fetchInventoryGroups,
  fetchInventoryItems,
  saveInventoryPackagePrices,
  type InventoryPackagePriceInput,
} from './queries'

const priceDateFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatPriceDate(value: string): string {
  return priceDateFormatter.format(new Date(value))
}

function priceInputValue(item: InventoryItemView, draft: Record<string, string>): string {
  return draft[item.id] ?? (item.package_price > 0 ? String(item.package_price) : '')
}

export function InventoryPricesPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = profile?.role === 'admin'
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const itemsQuery = useQuery({
    queryKey: ['inventory_items'],
    queryFn: fetchInventoryItems,
  })

  const groupsQuery = useQuery({
    queryKey: ['inventory_groups'],
    queryFn: fetchInventoryGroups,
  })

  const saveMutation = useMutation({
    mutationFn: (input: InventoryPackagePriceInput[]) => saveInventoryPackagePrices(input),
    onSuccess: (_count, input) => {
      setDraft((current) => {
        const next = { ...current }
        for (const price of input) {
          next[price.itemId] = price.packagePrice > 0 ? String(price.packagePrice) : ''
        }
        return next
      })
      setSavedMessage(`Se guardaron ${input.length} precio${input.length === 1 ? '' : 's'}.`)
      void queryClient.invalidateQueries({ queryKey: ['inventory_items'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_item'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_groups'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_group'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_group_cost_history'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['recipe'] })
    },
  })

  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX')
  const filteredItems = useMemo(() => {
    const items = itemsQuery.data ?? []

    return items
      .filter((item) => {
        const haystack =
          `${item.name} ${item.group_name} ${item.category_name ?? ''}`.toLocaleLowerCase('es-MX')
        return haystack.includes(normalizedSearch)
      })
      .sort((a, b) => {
        const category = (a.category_name ?? '').localeCompare(b.category_name ?? '', 'es-MX')
        if (category !== 0) return category

        const group = a.group_name.localeCompare(b.group_name, 'es-MX')
        if (group !== 0) return group

        return a.name.localeCompare(b.name, 'es-MX')
      })
  }, [itemsQuery.data, normalizedSearch])

  const changes = useMemo(() => {
    const next: InventoryPackagePriceInput[] = []
    let invalid = false

    for (const item of itemsQuery.data ?? []) {
      const parsed = parsePackagePriceInput(priceInputValue(item, draft))

      if (parsed === null) {
        invalid = true
        continue
      }

      const stored = Math.round(item.package_price * 10_000) / 10_000
      if (parsed !== stored) {
        next.push({ itemId: item.id, packagePrice: parsed })
      }
    }

    return { items: next, invalid }
  }, [draft, itemsQuery.data])

  const canSave = changes.items.length > 0 && !changes.invalid && !saveMutation.isPending

  function updatePrice(itemId: string, value: string) {
    setSavedMessage(null)
    if (saveMutation.isError) saveMutation.reset()
    setDraft((current) => ({ ...current, [itemId]: value }))
  }

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
        <h1 className="font-semibold">Acceso restringido</h1>
        <p className="mt-1 text-sm">Solo administradores pueden editar precios de insumos.</p>
        <Link to="/insumos" className="mt-4 inline-flex text-sm text-amber-100 underline">
          Volver a insumos
        </Link>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Catálogo</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Precios de insumos</h1>
        </div>
        <Link
          to="/insumos"
          className="shrink-0 rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
        >
          Volver
        </Link>
      </section>

      <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-sm text-neutral-300">
          Captura lo que pagaste por la presentación de compra. El precio se muestra tal como lo
          capturaste y el costo por unidad se calcula automáticamente. En grupos con un solo insumo,
          también se actualiza el costo de referencia que usan las recetas.
        </p>
        <p className="text-xs text-neutral-500">
          Las compras no modifican estos precios. Solo cambian cuando los actualizas aquí.
        </p>
        <p className="text-xs text-amber-300/80">
          El hielo se costea desde Hielo del día; su precio aquí no cambia el costo por bebida.
        </p>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-800 pt-3">
          <div>
            <p className="text-sm font-medium text-neutral-200">
              {changes.items.length === 0
                ? 'Sin cambios pendientes'
                : `${changes.items.length} precio${changes.items.length === 1 ? '' : 's'} por guardar`}
            </p>
            {changes.invalid ? (
              <p className="mt-0.5 text-xs text-red-400">Revisa los precios marcados en rojo.</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => saveMutation.mutate(changes.items)}
            className="shrink-0 rounded-xl bg-brand-400 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveMutation.isPending ? 'Guardando…' : 'Guardar precios'}
          </button>
        </div>

        {savedMessage ? (
          <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
            {savedMessage}
          </p>
        ) : null}

        {saveMutation.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {saveMutation.error.message}
          </p>
        ) : null}
      </section>

      <input
        type="search"
        placeholder="Buscar insumo, grupo o categoría"
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

          {filteredItems.map((item) => {
            const value = priceInputValue(item, draft)
            const parsed = parsePackagePriceInput(value)
            const unitCost =
              parsed === null ? null : packagePriceToUnitCost(parsed, item.purchase_factor)
            const group = groupsQuery.data?.find(
              (candidate) => candidate.group_id === item.group_id,
            )
            const groupHasMultipleItems = (group?.item_count ?? 0) > 1

            return (
              <div
                key={item.id}
                className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {item.group_name} · {item.category_name ?? 'Sin categoría'}
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      <Link to={`/insumos/${item.id}`} className="text-brand-300 underline">
                        Editar presentación
                      </Link>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-neutral-500">Precio del paquete</p>
                    <p className="text-sm font-semibold">
                      {parsed === null || parsed <= 0 ? '—' : formatPackagePrice(parsed)}
                    </p>
                    <p className="mt-0.5 max-w-40 text-[11px] text-neutral-500">
                      {packagePresentationLabel(
                        item.purchase_unit,
                        item.purchase_factor,
                        item.base_unit,
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      {unitCost === null
                        ? 'Costo: —'
                        : `Costo: ${formatUnitCost(unitCost)}/${item.base_unit}`}
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor={`package-price-${item.id}`}
                    className="mb-1.5 block text-sm text-neutral-300"
                  >
                    Precio del paquete (MXN)
                  </label>
                  <input
                    id={`package-price-${item.id}`}
                    type="number"
                    min="0"
                    step="0.0001"
                    inputMode="decimal"
                    value={value}
                    disabled={saveMutation.isPending}
                    onChange={(event) => updatePrice(item.id, event.target.value)}
                    className={`w-full rounded-xl border bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-60 ${
                      parsed === null ? 'border-red-500' : 'border-neutral-700'
                    }`}
                  />
                  <div className="mt-1 flex items-start justify-between gap-3">
                    {parsed === null ? (
                      <p className="text-xs text-red-400">Captura un precio válido.</p>
                    ) : item.package_price > 0 ? (
                      <p className="text-[11px] text-neutral-500">
                        Guardado: {formatPackagePrice(item.package_price)} ·{' '}
                        {packagePresentationLabel(
                          item.purchase_unit,
                          item.purchase_factor,
                          item.base_unit,
                        )}
                      </p>
                    ) : (
                      <p className="text-[11px] text-amber-300">Sin precio guardado.</p>
                    )}
                    {item.package_price_updated_at ? (
                      <p className="text-right text-[11px] text-neutral-500">
                        Actualizado {formatPriceDate(item.package_price_updated_at)}
                      </p>
                    ) : null}
                  </div>
                  {!item.active ? (
                    <p className="mt-1 text-[11px] text-amber-300">
                      Inactivo: el precio se guarda, pero no se sincroniza al costo de referencia.
                    </p>
                  ) : groupHasMultipleItems ? (
                    <p className="mt-1 text-[11px] text-amber-300">
                      Este grupo tiene {group?.item_count} marcas activas. El precio se guarda por
                      insumo; el costo de receta usa el costo de referencia del grupo.
                    </p>
                  ) : null}
                </div>

                {!item.active ? (
                  <span className="inline-flex rounded-full bg-neutral-800 px-2 py-1 text-[11px] text-neutral-400">
                    Inactivo
                  </span>
                ) : null}
              </div>
            )
          })}

          <button
            type="button"
            disabled={!canSave}
            onClick={() => saveMutation.mutate(changes.items)}
            className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveMutation.isPending
              ? 'Guardando…'
              : changes.items.length === 0
                ? 'Sin cambios por guardar'
                : `Guardar ${changes.items.length} precio${changes.items.length === 1 ? '' : 's'}`}
          </button>
        </div>
      ) : null}
    </div>
  )
}
