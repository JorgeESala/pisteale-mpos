import type {
  InventoryGroupCost,
  InventoryItemView,
  InventoryLatestPurchase,
  Product,
  Recipe,
  RecipeDefaultConsumableView,
  RecipeItem,
} from '@/types/database'

export type PriceDraft = {
  packagePrice: string
  purchaseUnit: string
  purchaseFactor: string
}

export type CostGapType = 'recipe' | 'ingredient' | 'premium' | 'consumable'

export type CostGap = {
  type: CostGapType
  label: string
  groupId?: string
  search?: string
  tier?: 'normal' | 'premium'
}

export type SimulatedProductCost = {
  product: Product
  normalRecipeCost: number | null
  premiumRecipeCost: number | null
  consumablesCost: number | null
  normalCost: number | null
  premiumCost: number | null
  normalMargin: number | null
  premiumMargin: number | null
  status: 'complete' | 'pending' | 'no_recipe'
  gaps: CostGap[]
}

export type SimulateCostsInput = {
  products: Product[]
  items: InventoryItemView[]
  groups: InventoryGroupCost[]
  defaults: RecipeDefaultConsumableView[]
  recipes: Recipe[]
  recipeItems: RecipeItem[]
  drafts: Record<string, PriceDraft>
  iceDensity: number
  icePricePerGram: number
}

export const ICE_PRICE_PER_GRAM = 0.006

export function roundUnitCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function parseDraftCost(draft: PriceDraft | undefined): number | null {
  if (!draft) return null

  const price = Number(draft.packagePrice)
  const factor = Number(draft.purchaseFactor)

  if (!Number.isFinite(price) || price <= 0) return null
  if (!Number.isFinite(factor) || factor <= 0) return null

  return roundUnitCost(price / factor)
}

function groupUnitCost(
  group: InventoryGroupCost,
  tierRule: string,
  drinkTier: 'normal' | 'premium',
  singleItemDraft: PriceDraft | undefined,
): number | null {
  if (singleItemDraft !== undefined) {
    return parseDraftCost(singleItemDraft)
  }

  if (!group.is_tiered || tierRule === 'any') {
    return group.reference_cost ?? group.all_avg_cost
  }

  if (tierRule === 'estandar') {
    return group.reference_cost ?? group.standard_avg_cost
  }

  if (tierRule === 'premium') {
    return group.premium_avg_cost
  }

  return drinkTier === 'premium'
    ? group.premium_avg_cost
    : (group.reference_cost ?? group.standard_avg_cost)
}

function gapLabel(
  group: InventoryGroupCost,
  activeItems: InventoryItemView[],
  tierRule: string,
  drinkTier: 'normal' | 'premium',
): { type: CostGapType; label: string; search?: string } {
  if (activeItems.length === 0) {
    return {
      type: 'ingredient',
      label: `Sin insumos activos en ${group.name}`,
      search: group.name,
    }
  }

  if (
    group.is_tiered &&
    ((tierRule === 'match' && drinkTier === 'premium') || tierRule === 'premium') &&
    group.premium_avg_cost === null
  ) {
    return {
      type: 'premium',
      label: `Falta marca premium en ${group.name}`,
      search: group.name,
    }
  }

  if (activeItems.length === 1) {
    return {
      type: 'ingredient',
      label: `Falta precio de ${activeItems[0]!.name}`,
      search: activeItems[0]!.name,
    }
  }

  return {
    type: 'ingredient',
    label: `Falta costo de referencia en ${group.name}`,
    search: group.name,
  }
}

export function simulateProductCosts(input: SimulateCostsInput): SimulatedProductCost[] {
  const groupById = new Map(input.groups.map((group) => [group.group_id, group]))
  const itemsByGroup = new Map<string, InventoryItemView[]>()

  for (const item of input.items) {
    if (!item.active) continue
    const list = itemsByGroup.get(item.group_id) ?? []
    list.push(item)
    itemsByGroup.set(item.group_id, list)
  }

  const recipeByProduct = new Map(input.recipes.map((recipe) => [recipe.product_id, recipe]))
  const linesByRecipe = new Map<string, RecipeItem[]>()

  for (const line of input.recipeItems) {
    const list = linesByRecipe.get(line.recipe_id) ?? []
    list.push(line)
    linesByRecipe.set(line.recipe_id, list)
  }

  return input.products.map((product) => {
    const recipe = recipeByProduct.get(product.id)
    const lines = recipe ? (linesByRecipe.get(recipe.id) ?? []) : []
    const gaps: CostGap[] = []
    const gapKeys = new Set<string>()

    const addGap = (gap: CostGap) => {
      const key = `${gap.type}:${gap.groupId ?? ''}:${gap.tier ?? ''}`
      if (gapKeys.has(key)) return
      gapKeys.add(key)
      gaps.push(gap)
    }

    if (!recipe || lines.length === 0) {
      addGap({ type: 'recipe', label: 'Sin receta' })
      return {
        product,
        normalRecipeCost: null,
        premiumRecipeCost: null,
        consumablesCost: null,
        normalCost: null,
        premiumCost: null,
        normalMargin: null,
        premiumMargin: null,
        status: 'no_recipe',
        gaps,
      }
    }

    const yieldQty = Number(recipe.yield_qty) > 0 ? Number(recipe.yield_qty) : 1
    const tierCosts: Record<'normal' | 'premium', number | null> = {
      normal: null,
      premium: null,
    }

    for (const drinkTier of ['normal', 'premium'] as const) {
      if (drinkTier === 'premium' && product.premium_price === null) continue

      let batchCost = 0
      let complete = true

      for (const line of lines) {
        const group = groupById.get(line.inventory_group_id)
        if (!group) {
          addGap({
            type: 'ingredient',
            label: 'Falta un grupo de insumos de la receta',
            groupId: line.inventory_group_id,
            tier: drinkTier,
          })
          complete = false
          continue
        }

        const activeItems = itemsByGroup.get(group.group_id) ?? []
        const singleItemDraft =
          activeItems.length === 1 ? input.drafts[activeItems[0]!.id] : undefined
        const unitCost = groupUnitCost(group, line.tier_rule, drinkTier, singleItemDraft)

        if (unitCost === null) {
          const gap = gapLabel(group, activeItems, line.tier_rule, drinkTier)
          addGap({ ...gap, groupId: group.group_id, tier: drinkTier })
          complete = false
          continue
        }

        batchCost += Number(line.qty_base) * unitCost
      }

      if (complete) {
        tierCosts[drinkTier] = roundMoney(batchCost / yieldQty)
      }
    }

    let consumablesCost: number | null = 0
    const applicableDefaults = input.defaults.filter(
      (item) => item.active && item.applies_to_kind === 'preparado',
    )

    if (product.kind === 'preparado' && applicableDefaults.length > 0) {
      let total = 0
      let complete = true

      const liquidMl = lines.reduce((sum, line) => {
        const group = groupById.get(line.inventory_group_id)
        return group?.base_unit === 'ml' ? sum + Number(line.qty_base) : sum
      }, 0)

      for (const defaultItem of applicableDefaults) {
        const group = groupById.get(defaultItem.group_id)

        if (!group) {
          addGap({
            type: 'consumable',
            label: 'Falta un grupo de consumibles',
            groupId: defaultItem.group_id,
          })
          complete = false
          continue
        }

        if (defaultItem.role === 'ice') {
          const iceMl = Math.max(0, product.serving_size_ml - liquidMl)
          total += iceMl * input.iceDensity * input.icePricePerGram
          continue
        }

        const activeItems = itemsByGroup.get(group.group_id) ?? []
        const singleItemDraft =
          activeItems.length === 1 ? input.drafts[activeItems[0]!.id] : undefined
        const unitCost =
          singleItemDraft !== undefined
            ? parseDraftCost(singleItemDraft)
            : (defaultItem.avg_cost ?? group.reference_cost ?? group.all_avg_cost)

        if (unitCost === null) {
          addGap({
            type: 'consumable',
            label: `Falta precio de ${group.name}`,
            groupId: group.group_id,
            search: group.name,
          })
          complete = false
          continue
        }

        total += (defaultItem.qty_base ?? 1) * unitCost
      }

      consumablesCost = complete ? roundMoney(total) : null
    }

    const normalCost =
      tierCosts.normal === null || consumablesCost === null
        ? null
        : roundMoney(tierCosts.normal + consumablesCost)

    const premiumCost =
      product.premium_price === null || tierCosts.premium === null || consumablesCost === null
        ? null
        : roundMoney(tierCosts.premium + consumablesCost)

    const normalMargin = normalCost === null ? null : roundMoney(product.price - normalCost)
    const premiumMargin =
      premiumCost === null || product.premium_price === null
        ? null
        : roundMoney(product.premium_price - premiumCost)

    const status =
      normalCost === null || (product.premium_price !== null && premiumCost === null)
        ? 'pending'
        : 'complete'

    return {
      product,
      normalRecipeCost: tierCosts.normal,
      premiumRecipeCost: tierCosts.premium,
      consumablesCost,
      normalCost,
      premiumCost,
      normalMargin,
      premiumMargin,
      status,
      gaps,
    }
  })
}

export function buildInitialDrafts(
  items: InventoryItemView[],
  groups: InventoryGroupCost[],
): Record<string, PriceDraft> {
  const groupById = new Map(groups.map((group) => [group.group_id, group]))
  const drafts: Record<string, PriceDraft> = {}

  for (const item of items) {
    const group = groupById.get(item.group_id)
    const referencePackage =
      group?.item_count === 1 && group.reference_cost && item.purchase_factor > 0
        ? Math.round(group.reference_cost * item.purchase_factor * 10_000) / 10_000
        : 0
    const packagePrice = item.package_price > 0 ? item.package_price : referencePackage

    drafts[item.id] = {
      packagePrice: packagePrice > 0 ? String(packagePrice) : '',
      purchaseUnit: item.purchase_unit,
      purchaseFactor: String(item.purchase_factor),
    }
  }

  return drafts
}

export function manualPriceIsNewer(
  item: InventoryItemView,
  latest: InventoryLatestPurchase,
): boolean {
  if (!item.package_price_updated_at) return false
  return new Date(item.package_price_updated_at).getTime() > new Date(latest.purchased_at).getTime()
}
