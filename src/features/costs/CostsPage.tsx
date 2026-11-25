import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import {
  fetchAllProducts,
  fetchAllRecipeItems,
  fetchAllRecipes,
  fetchDefaultConsumables,
  fetchIceDensity,
  fetchInventoryGroups,
  fetchInventoryItems,
  fetchLatestPurchases,
  fetchProductCategories,
  saveInventoryPackagePrices,
} from '@/features/catalog/queries'
import type { InventoryItemView, InventoryLatestPurchase } from '@/types/database'
import { CostsBeveragesPanel } from './CostsBeveragesPanel'
import { CostsPricesPanel } from './CostsPricesPanel'
import {
  ICE_PRICE_PER_GRAM,
  buildInitialDrafts,
  parseDraftCost,
  simulateProductCosts,
  type PriceDraft,
} from './simulate-costs'

type PriceFilter = 'all' | 'missing' | 'used'

function roundPackagePrice(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function isOutdated(
  draft: PriceDraft | undefined,
  latest: InventoryLatestPurchase | undefined,
): boolean {
  if (!latest) return false
  if (!draft) return true

  const draftCost = parseDraftCost(draft)
  if (draftCost === null) return true
  if (Math.abs(latest.unit_cost - draftCost) > 0.00001) return true

  if (latest.presentation_known) {
    const factor = Number(draft.purchaseFactor)
    if (latest.purchase_unit !== draft.purchaseUnit) return true
    if (!Number.isFinite(factor) || Math.abs(latest.purchase_factor - factor) > 0.0001) return true
  }

  return false
}

function draftIsValid(draft: PriceDraft): boolean {
  const price = Number(draft.packagePrice)
  const factor = Number(draft.purchaseFactor)

  return (
    Number.isFinite(price) &&
    price >= 0 &&
    Number.isFinite(factor) &&
    factor > 0 &&
    draft.purchaseUnit.trim().length > 0
  )
}

export function CostsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const canEdit = profile?.role === 'admin'
  const [draftOverrides, setDraftOverrides] = useState<Record<string, PriceDraft>>({})
  const [priceSearch, setPriceSearch] = useState('')
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all')
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const tab = searchParams.get('tab') === 'insumos' ? 'insumos' : 'bebidas'

  const productsQuery = useQuery({
    queryKey: ['products_all'],
    queryFn: fetchAllProducts,
  })

  const itemsQuery = useQuery({
    queryKey: ['inventory_items'],
    queryFn: fetchInventoryItems,
  })

  const groupsQuery = useQuery({
    queryKey: ['inventory_groups'],
    queryFn: fetchInventoryGroups,
  })

  const defaultsQuery = useQuery({
    queryKey: ['recipe_default_consumables'],
    queryFn: fetchDefaultConsumables,
  })

  const iceDensityQuery = useQuery({
    queryKey: ['ice_density'],
    queryFn: fetchIceDensity,
  })

  const recipesQuery = useQuery({
    queryKey: ['recipes_all'],
    queryFn: fetchAllRecipes,
  })

  const recipeItemsQuery = useQuery({
    queryKey: ['recipe_items_all'],
    queryFn: fetchAllRecipeItems,
  })

  const latestPurchasesQuery = useQuery({
    queryKey: ['inventory_latest_purchases'],
    queryFn: fetchLatestPurchases,
  })

  const categoriesQuery = useQuery({
    queryKey: ['product_categories'],
    queryFn: fetchProductCategories,
  })

  const initialDrafts = useMemo(
    () => buildInitialDrafts(itemsQuery.data ?? [], groupsQuery.data ?? []),
    [groupsQuery.data, itemsQuery.data],
  )

  const drafts = useMemo(
    () => ({ ...initialDrafts, ...draftOverrides }),
    [draftOverrides, initialDrafts],
  )

  const latestByItem = useMemo(() => {
    const map = new Map<string, InventoryLatestPurchase>()
    for (const latest of latestPurchasesQuery.data ?? []) {
      map.set(latest.item_id, latest)
    }
    return map
  }, [latestPurchasesQuery.data])

  const categoryNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const category of categoriesQuery.data ?? []) {
      map.set(category.id, category.name)
    }
    return map
  }, [categoriesQuery.data])

  const activeProducts = useMemo(
    () => (productsQuery.data ?? []).filter((product) => product.active),
    [productsQuery.data],
  )

  const simulated = useMemo(() => {
    if (
      !itemsQuery.data ||
      !groupsQuery.data ||
      !defaultsQuery.data ||
      !recipesQuery.data ||
      !recipeItemsQuery.data
    ) {
      return []
    }

    return simulateProductCosts({
      products: activeProducts,
      items: itemsQuery.data,
      groups: groupsQuery.data,
      defaults: defaultsQuery.data,
      recipes: recipesQuery.data,
      recipeItems: recipeItemsQuery.data,
      drafts,
      iceDensity: iceDensityQuery.data ?? 0.9,
      icePricePerGram: ICE_PRICE_PER_GRAM,
    })
  }, [
    activeProducts,
    defaultsQuery.data,
    drafts,
    groupsQuery.data,
    iceDensityQuery.data,
    itemsQuery.data,
    recipeItemsQuery.data,
    recipesQuery.data,
  ])

  const usedGroupIds = useMemo(
    () => new Set((recipeItemsQuery.data ?? []).map((item) => item.inventory_group_id)),
    [recipeItemsQuery.data],
  )

  const completeCount = simulated.filter((row) => row.status === 'complete').length
  const pendingCount = simulated.filter((row) => row.status === 'pending').length
  const noRecipeCount = simulated.filter((row) => row.status === 'no_recipe').length

  const activeItems = (itemsQuery.data ?? []).filter((item) => item.active)
  const missingPriceCount = activeItems.filter(
    (item) => parseDraftCost(drafts[item.id]) === null,
  ).length

  const outdatedCount = activeItems.filter((item) =>
    isOutdated(drafts[item.id], latestByItem.get(item.id)),
  ).length

  const changes = activeItems.filter((item) => {
    const draft = drafts[item.id]
    if (!draft || !draftIsValid(draft)) return false

    const price = roundPackagePrice(Number(draft.packagePrice))
    const factor = roundPackagePrice(Number(draft.purchaseFactor))
    const unit = draft.purchaseUnit.trim()

    return (
      price !== roundPackagePrice(item.package_price) ||
      factor !== roundPackagePrice(item.purchase_factor) ||
      unit !== item.purchase_unit
    )
  })

  const hasInvalid = (itemsQuery.data ?? []).some((item) => {
    const draft = drafts[item.id]
    return draft !== undefined && !draftIsValid(draft)
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      saveInventoryPackagePrices(
        changes.map((item) => {
          const draft = drafts[item.id]!
          return {
            itemId: item.id,
            packagePrice: roundPackagePrice(Number(draft.packagePrice)),
            purchaseUnit: draft.purchaseUnit.trim(),
            purchaseFactor: roundPackagePrice(Number(draft.purchaseFactor)),
          }
        }),
      ),
    onSuccess: (count) => {
      setSavedMessage(`Se guardaron ${count} precio${count === 1 ? '' : 's'} y su presentación.`)
      void queryClient.invalidateQueries({ queryKey: ['inventory_items'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_item'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_groups'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_group'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_group_cost_history'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['recipe'] })
    },
  })

  function setTab(next: 'bebidas' | 'insumos') {
    const params = new URLSearchParams(searchParams)
    if (next === 'insumos') params.set('tab', 'insumos')
    else params.delete('tab')
    setSearchParams(params, { replace: true })
  }

  function goToPrices(search: string) {
    setPriceSearch(search)
    setTab('insumos')
  }

  function updateDraft(itemId: string, draft: PriceDraft) {
    setSavedMessage(null)
    if (saveMutation.isError) saveMutation.reset()
    setDraftOverrides((current) => ({ ...current, [itemId]: draft }))
  }

  function applyLatest(item: InventoryItemView, latest: InventoryLatestPurchase) {
    const draft = drafts[item.id] ?? {
      packagePrice: '',
      purchaseUnit: item.purchase_unit,
      purchaseFactor: String(item.purchase_factor),
    }

    const nextDraft: PriceDraft = latest.presentation_known
      ? {
          packagePrice: String(latest.package_price),
          purchaseUnit: latest.purchase_unit,
          purchaseFactor: String(latest.purchase_factor),
        }
      : {
          ...draft,
          packagePrice: String(
            roundPackagePrice(
              latest.unit_cost * (Number(draft.purchaseFactor) || item.purchase_factor),
            ),
          ),
        }

    setDraftOverrides((current) => ({ ...current, [item.id]: nextDraft }))
  }

  function applyAllLatest() {
    const next: Record<string, PriceDraft> = {}

    for (const item of activeItems) {
      const latest = latestByItem.get(item.id)
      if (!latest) continue

      const draft = drafts[item.id] ?? {
        packagePrice: '',
        purchaseUnit: item.purchase_unit,
        purchaseFactor: String(item.purchase_factor),
      }

      if (!isOutdated(draft, latest)) continue

      next[item.id] = latest.presentation_known
        ? {
            packagePrice: String(latest.package_price),
            purchaseUnit: latest.purchase_unit,
            purchaseFactor: String(latest.purchase_factor),
          }
        : {
            ...draft,
            packagePrice: String(
              roundPackagePrice(
                latest.unit_cost * (Number(draft.purchaseFactor) || item.purchase_factor),
              ),
            ),
          }
    }

    setDraftOverrides((current) => ({ ...current, ...next }))
  }

  const isLoading =
    productsQuery.isLoading ||
    itemsQuery.isLoading ||
    groupsQuery.isLoading ||
    defaultsQuery.isLoading ||
    iceDensityQuery.isLoading ||
    recipesQuery.isLoading ||
    recipeItemsQuery.isLoading ||
    latestPurchasesQuery.isLoading ||
    categoriesQuery.isLoading

  const error =
    productsQuery.error ??
    itemsQuery.error ??
    groupsQuery.error ??
    defaultsQuery.error ??
    iceDensityQuery.error ??
    recipesQuery.error ??
    recipeItemsQuery.error ??
    latestPurchasesQuery.error ??
    categoriesQuery.error

  if (isLoading) {
    return <p className="text-sm text-neutral-500">Cargando simulador de costos…</p>
  }

  if (error) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error.message}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Catálogo</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Costos</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Simulador de día perfecto con hielo a $30.00 / 5 kg.
          </p>
        </div>
        <span className="rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1.5 text-xs text-brand-200">
          {canEdit ? 'Edición admin' : 'Solo lectura'}
        </span>
      </section>

      <section className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Bebidas completas</p>
          <p className="mt-1 text-xl font-semibold text-green-300">{completeCount}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Bebidas pendientes</p>
          <p className="mt-1 text-xl font-semibold text-yellow-300">{pendingCount}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Sin receta</p>
          <p className="mt-1 text-xl font-semibold text-amber-300">{noRecipeCount}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Insumos sin precio</p>
          <p className="mt-1 text-xl font-semibold text-yellow-300">{missingPriceCount}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Precios desactualizados vs última compra</p>
          <p className="mt-1 text-xl font-semibold text-amber-300">{outdatedCount}</p>
        </div>
      </section>

      <div className="flex rounded-xl border border-neutral-800 bg-neutral-900 p-1 no-print">
        <button
          type="button"
          onClick={() => setTab('bebidas')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            tab === 'bebidas' ? 'bg-brand-400/10 text-brand-300' : 'text-neutral-500'
          }`}
        >
          Bebidas ({simulated.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('insumos')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            tab === 'insumos' ? 'bg-brand-400/10 text-brand-300' : 'text-neutral-500'
          }`}
        >
          Precios de insumos ({itemsQuery.data?.length ?? 0})
        </button>
      </div>

      {tab === 'bebidas' ? (
        <CostsBeveragesPanel
          results={simulated}
          categoryNames={categoryNames}
          canEdit={canEdit}
          onGoToPrices={goToPrices}
          onGoToGroup={(groupId) => navigate(`/insumos/grupos/${groupId}`)}
          onGoToRecipe={(productId) => navigate(`/catalogo/${productId}`)}
        />
      ) : (
        <CostsPricesPanel
          items={itemsQuery.data ?? []}
          groups={groupsQuery.data ?? []}
          latestPurchases={latestByItem}
          drafts={drafts}
          usedGroupIds={usedGroupIds}
          canEdit={canEdit}
          search={priceSearch}
          onSearchChange={setPriceSearch}
          onDraftChange={updateDraft}
          onApplyLatest={applyLatest}
          onApplyAll={applyAllLatest}
          onSave={() => saveMutation.mutate()}
          savePending={saveMutation.isPending}
          changesCount={changes.length}
          outdatedCount={outdatedCount}
          hasInvalid={hasInvalid}
          savedMessage={savedMessage}
          saveError={saveMutation.isError ? saveMutation.error.message : null}
          filter={priceFilter}
          onFilterChange={setPriceFilter}
        />
      )}
    </div>
  )
}
