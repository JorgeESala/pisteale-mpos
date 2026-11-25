import { useMemo } from 'react'
import { formatPackagePrice, packagePresentationLabel } from '@/features/catalog/inventory-pricing'
import { formatUnitCost } from '@/lib/format'
import type {
  InventoryGroupCost,
  InventoryItemView,
  InventoryLatestPurchase,
} from '@/types/database'
import { manualPriceIsNewer, parseDraftCost, type PriceDraft } from './simulate-costs'

type PriceFilter = 'all' | 'missing' | 'used'

type CostsPricesPanelProps = {
  items: InventoryItemView[]
  groups: InventoryGroupCost[]
  latestPurchases: Map<string, InventoryLatestPurchase>
  drafts: Record<string, PriceDraft>
  usedGroupIds: Set<string>
  canEdit: boolean
  search: string
  onSearchChange: (value: string) => void
  onDraftChange: (itemId: string, draft: PriceDraft) => void
  onApplyLatest: (item: InventoryItemView, latest: InventoryLatestPurchase) => void
  onApplyAll: () => void
  onSave: () => void
  savePending: boolean
  changesCount: number
  outdatedCount: number
  fixedIceItemIds: Set<string>
  hasInvalid: boolean
  savedMessage: string | null
  saveError: string | null
  filter: PriceFilter
  onFilterChange: (filter: PriceFilter) => void
}

function formatPurchaseDate(value: string): string {
  return new Date(value).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function CostsPricesPanel({
  items,
  groups,
  latestPurchases,
  drafts,
  usedGroupIds,
  canEdit,
  search,
  onSearchChange,
  onDraftChange,
  onApplyLatest,
  onApplyAll,
  onSave,
  savePending,
  changesCount,
  outdatedCount,
  fixedIceItemIds,
  hasInvalid,
  savedMessage,
  saveError,
  filter,
  onFilterChange,
}: CostsPricesPanelProps) {
  const groupById = useMemo(() => new Map(groups.map((group) => [group.group_id, group])), [groups])

  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX')

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        const draft = drafts[item.id]
        const draftCost = parseDraftCost(draft)
        const group = groupById.get(item.group_id)
        const haystack =
          `${item.name} ${item.group_name} ${item.category_name ?? ''}`.toLocaleLowerCase('es-MX')

        if (!haystack.includes(normalizedSearch)) return false
        if (filter === 'missing' && draftCost !== null) return false
        if (filter === 'used' && !usedGroupIds.has(group?.group_id ?? item.group_id)) return false

        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es-MX'))
  }, [drafts, filter, groupById, items, normalizedSearch, usedGroupIds])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Precios de insumos</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Edita y observa el impacto en las bebidas antes de guardar. La presentación se toma de
            la última compra cuando la aceptas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          {canEdit ? (
            <button
              type="button"
              disabled={outdatedCount === 0}
              onClick={onApplyAll}
              className="rounded-xl border border-brand-400/40 px-3 py-2 text-xs text-brand-300 transition hover:border-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sincronizar todo ({outdatedCount})
            </button>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              disabled={savePending || changesCount === 0 || hasInvalid}
              onClick={onSave}
              className="rounded-xl bg-brand-400 px-4 py-2 text-xs font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savePending
                ? 'Guardando…'
                : changesCount === 0
                  ? 'Sin cambios'
                  : `Guardar ${changesCount} precio${changesCount === 1 ? '' : 's'}`}
            </button>
          ) : (
            <span className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-400">
              Solo lectura
            </span>
          )}
        </div>
      </div>

      {savedMessage ? (
        <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300 no-print">
          {savedMessage}
        </p>
      ) : null}

      {saveError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 no-print">
          {saveError}
        </p>
      ) : null}

      {hasInvalid ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 no-print">
          Hay precios o presentaciones inválidas. Revisa los campos marcados.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-2 no-print sm:grid-cols-[1fr_auto]">
        <input
          type="search"
          value={search}
          placeholder="Buscar insumo, grupo o categoría"
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
        />
        <select
          value={filter}
          onChange={(event) => onFilterChange(event.target.value as PriceFilter)}
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
        >
          <option value="all">Todos</option>
          <option value="missing">Sin precio</option>
          <option value="used">Usados en recetas</option>
        </select>
      </div>

      <p className="text-xs text-neutral-500 no-print">{filteredItems.length} insumos</p>

      <div className="space-y-3">
        {filteredItems.map((item) => {
          const draft = drafts[item.id]
          const latest = latestPurchases.get(item.id)
          const draftCost = parseDraftCost(draft)
          const draftFactor = Number(draft?.purchaseFactor)
          const draftPresentation =
            draft &&
            Number.isFinite(draftFactor) &&
            draftFactor > 0 &&
            draft.purchaseUnit.trim() !== ''
              ? packagePresentationLabel(draft.purchaseUnit, draftFactor, item.base_unit)
              : 'Presentación inválida'

          const unitDiff = latest && draftCost !== null ? latest.unit_cost - draftCost : null
          const unitDiffPct =
            latest && draftCost !== null && draftCost > 0
              ? ((latest.unit_cost - draftCost) / draftCost) * 100
              : null

          const priceDiff =
            latest !== undefined &&
            draftCost !== null &&
            Math.abs(latest.unit_cost - draftCost) > 0.00001

          const presentationDiff =
            latest !== undefined &&
            latest.presentation_known &&
            (latest.purchase_unit !== draft?.purchaseUnit ||
              Math.abs(latest.purchase_factor - (draftFactor || 0)) > 0.0001)

          const isFixedIce = fixedIceItemIds.has(item.id)
          const manualNewer = latest !== undefined && manualPriceIsNewer(item, latest)
          const outdated = !manualNewer && (priceDiff || presentationDiff)
          const needsPresentationReview = latest !== undefined && !latest.presentation_known
          const latestPresentation =
            latest !== undefined
              ? packagePresentationLabel(
                  latest.purchase_unit,
                  latest.purchase_factor,
                  item.base_unit,
                )
              : null

          return (
            <article
              key={item.id}
              className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 print:break-inside-avoid"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{item.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {item.group_name} · {item.category_name ?? 'Sin categoría'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-neutral-500">Costo unitario</p>
                  <p className="text-sm font-semibold">
                    {draftCost === null ? '—' : formatUnitCost(draftCost)}
                    <span className="ml-1 text-[11px] font-normal text-neutral-500">
                      /{item.base_unit}
                    </span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr]">
                <div>
                  <label
                    htmlFor={`price-${item.id}`}
                    className="mb-1 block text-[11px] text-neutral-400"
                  >
                    Precio del paquete
                  </label>
                  <input
                    id={`price-${item.id}`}
                    type="number"
                    min="0"
                    step="0.0001"
                    inputMode="decimal"
                    disabled={!canEdit || savePending || isFixedIce}
                    value={draft?.packagePrice ?? ''}
                    onChange={(event) =>
                      onDraftChange(item.id, {
                        packagePrice: event.target.value,
                        purchaseUnit: draft?.purchaseUnit ?? item.purchase_unit,
                        purchaseFactor: draft?.purchaseFactor ?? String(item.purchase_factor),
                      })
                    }
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-base text-neutral-100 outline-none transition focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`unit-${item.id}`}
                    className="mb-1 block text-[11px] text-neutral-400"
                  >
                    Presentación
                  </label>
                  <input
                    id={`unit-${item.id}`}
                    type="text"
                    disabled={!canEdit || savePending || isFixedIce}
                    value={draft?.purchaseUnit ?? item.purchase_unit}
                    onChange={(event) =>
                      onDraftChange(item.id, {
                        packagePrice: draft?.packagePrice ?? '',
                        purchaseUnit: event.target.value,
                        purchaseFactor: draft?.purchaseFactor ?? String(item.purchase_factor),
                      })
                    }
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-base text-neutral-100 outline-none transition focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`factor-${item.id}`}
                    className="mb-1 block text-[11px] text-neutral-400"
                  >
                    Contenido ({item.base_unit})
                  </label>
                  <input
                    id={`factor-${item.id}`}
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    disabled={!canEdit || savePending || isFixedIce}
                    value={draft?.purchaseFactor ?? String(item.purchase_factor)}
                    onChange={(event) =>
                      onDraftChange(item.id, {
                        packagePrice: draft?.packagePrice ?? '',
                        purchaseUnit: draft?.purchaseUnit ?? item.purchase_unit,
                        purchaseFactor: event.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-base text-neutral-100 outline-none transition focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>

              <p className="text-[11px] text-neutral-500">
                {draftPresentation}
                {draftCost === null ? ' · Sin precio' : ''}
              </p>

              {isFixedIce ? (
                <div className="rounded-xl border border-brand-400/20 bg-brand-400/5 p-3 text-xs text-brand-200">
                  Hielo fijo: $30.00 / 5 kg. La simulación siempre usa este valor y no se sincroniza
                  con compras.
                </div>
              ) : latest ? (
                <div
                  className={`rounded-xl border p-3 text-xs ${
                    outdated || needsPresentationReview
                      ? 'border-amber-500/30 bg-amber-500/10'
                      : 'border-neutral-800 bg-neutral-950'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-200">Última compra</p>
                      <p className="mt-1 text-neutral-400">
                        {latest.presentation_known
                          ? `${formatPackagePrice(latest.package_price)} · ${latestPresentation}`
                          : `Costo unitario ${formatUnitCost(latest.unit_cost)}/${item.base_unit} · ${latest.qty_base} ${item.base_unit}`}
                      </p>
                      {!latest.presentation_known ? (
                        <p className="mt-1 text-amber-300">
                          Presentación histórica no registrada; se estima como {latestPresentation}.
                        </p>
                      ) : null}
                      <p className="mt-1 text-neutral-500">
                        {latest.source_label} · {formatPurchaseDate(latest.purchased_at)} ·{' '}
                        {latest.source === 'event' ? 'Evento' : 'Compra'}
                      </p>
                      {priceDiff && unitDiff !== null ? (
                        <p className="mt-1 text-amber-200">
                          Costo unitario: {formatUnitCost(draftCost!)} →{' '}
                          {formatUnitCost(latest.unit_cost)}
                          {unitDiffPct === null
                            ? ''
                            : ` (${unitDiffPct > 0 ? '+' : ''}${unitDiffPct.toFixed(1)}%)`}
                        </p>
                      ) : null}
                      {presentationDiff ? (
                        <p className="mt-1 text-amber-200">
                          Presentación distinta: {draftPresentation} → {latestPresentation}.
                        </p>
                      ) : null}
                      {manualNewer ? (
                        <p className="mt-1 text-neutral-500">
                          Precio manual más reciente que esta compra; no se marca como pendiente.
                        </p>
                      ) : outdated ? (
                        <p className="mt-1 text-neutral-500">
                          La última compra no coincide con la simulación.
                        </p>
                      ) : needsPresentationReview ? (
                        <p className="mt-1 text-amber-300">
                          Costo al día; falta confirmar la presentación histórica.
                        </p>
                      ) : (
                        <p className="mt-1 text-green-300">Al día con la última compra.</p>
                      )}
                      {canEdit && needsPresentationReview && !outdated ? (
                        <p className="mt-1 text-neutral-500">
                          Ajusta la presentación arriba si no coincide con la compra.
                        </p>
                      ) : null}
                    </div>

                    {canEdit && outdated ? (
                      <button
                        type="button"
                        onClick={() => onApplyLatest(item, latest)}
                        className="shrink-0 rounded-xl border border-amber-400/40 px-3 py-2 text-amber-200 transition hover:border-amber-300"
                      >
                        {latest.presentation_known
                          ? 'Usar último precio y presentación'
                          : 'Usar último costo'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-neutral-500">Sin compras registradas.</p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
