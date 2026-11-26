import type {
  BaseUnit,
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

export type SimulatedIngredientLine = {
  groupId: string
  groupName: string
  itemName: string | null
  itemCount: number
  purchaseUnit: string | null
  purchaseFactor: number | null
  packagePrice: number | null
  unitCost: number | null
  qtyBase: number
  inputQty: number | null
  inputUnit: string | null
  baseUnit: BaseUnit
  lineCost: number | null
  missing: boolean
}

export type SimulatedConsumableLine = {
  role: RecipeDefaultConsumableView['role']
  groupId: string
  groupName: string
  qty: number | null
  grams: number | null
  unitCost: number | null
  lineCost: number | null
  missing: boolean
}

export type SimulatedTierDetail = {
  tier: 'normal' | 'premium'
  ingredientLines: SimulatedIngredientLine[]
  consumableLines: SimulatedConsumableLine[]
  recipeCost: number | null
  consumablesCost: number | null
  totalCost: number | null
  margin: number | null
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
  details: {
    normal: SimulatedTierDetail
    premium: SimulatedTierDetail | null
  }
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

type GroupPricing = {
  unitCost: number | null
  itemName: string | null
  itemCount: number
  purchaseUnit: string | null
  purchaseFactor: number | null
  packagePrice: number | null
}

function resolveGroupPricing(
  group: InventoryGroupCost,
  tierRule: string,
  drinkTier: 'normal' | 'premium',
  activeItems: InventoryItemView[],
  draft: PriceDraft | undefined,
): GroupPricing {
  if (activeItems.length === 1) {
    const item = activeItems[0]!

    if (draft !== undefined) {
      const unitCost = parseDraftCost(draft)
      const price = Number(draft.packagePrice)
      const factor = Number(draft.purchaseFactor)

      return {
        unitCost,
        itemName: item.name,
        itemCount: 1,
        purchaseUnit: draft.purchaseUnit || item.purchase_unit,
        purchaseFactor: Number.isFinite(factor) && factor > 0 ? factor : null,
        packagePrice: Number.isFinite(price) && price > 0 ? price : null,
      }
    }

    return {
      unitCost: groupUnitCost(group, tierRule, drinkTier, undefined),
      itemName: item.name,
      itemCount: 1,
      purchaseUnit: item.purchase_unit,
      purchaseFactor: item.purchase_factor,
      packagePrice: null,
    }
  }

  return {
    unitCost: groupUnitCost(group, tierRule, drinkTier, undefined),
    itemName: null,
    itemCount: activeItems.length,
    purchaseUnit: null,
    purchaseFactor: null,
    packagePrice: null,
  }
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

function emptyDetail(tier: 'normal' | 'premium'): SimulatedTierDetail {
  return {
    tier,
    ingredientLines: [],
    consumableLines: [],
    recipeCost: null,
    consumablesCost: null,
    totalCost: null,
    margin: null,
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
        details: {
          normal: emptyDetail('normal'),
          premium: product.premium_price === null ? null : emptyDetail('premium'),
        },
      }
    }

    const yieldQty = Number(recipe.yield_qty) > 0 ? Number(recipe.yield_qty) : 1
    const tierCosts: Record<'normal' | 'premium', number | null> = {
      normal: null,
      premium: null,
    }
    const ingredientLines: Record<'normal' | 'premium', SimulatedIngredientLine[]> = {
      normal: [],
      premium: [],
    }

    for (const drinkTier of ['normal', 'premium'] as const) {
      if (drinkTier === 'premium' && product.premium_price === null) continue

      let batchCost = 0
      let complete = true
      const tierLines: SimulatedIngredientLine[] = []

      for (const line of lines) {
        const group = groupById.get(line.inventory_group_id)
        const qtyBase = Number(line.qty_base) / yieldQty
        const inputQty = line.input_qty === null ? null : Number(line.input_qty) / yieldQty

        if (!group) {
          addGap({
            type: 'ingredient',
            label: 'Falta un grupo de insumos de la receta',
            groupId: line.inventory_group_id,
            tier: drinkTier,
          })
          tierLines.push({
            groupId: line.inventory_group_id,
            groupName: 'Grupo no encontrado',
            itemName: null,
            itemCount: 0,
            purchaseUnit: null,
            purchaseFactor: null,
            packagePrice: null,
            unitCost: null,
            qtyBase,
            inputQty,
            inputUnit: line.input_unit,
            baseUnit: 'ml',
            lineCost: null,
            missing: true,
          })
          complete = false
          continue
        }

        const activeItems = itemsByGroup.get(group.group_id) ?? []
        const draft = activeItems.length === 1 ? input.drafts[activeItems[0]!.id] : undefined
        const pricing = resolveGroupPricing(group, line.tier_rule, drinkTier, activeItems, draft)

        if (pricing.unitCost === null) {
          const gap = gapLabel(group, activeItems, line.tier_rule, drinkTier)
          addGap({ ...gap, groupId: group.group_id, tier: drinkTier })
          complete = false
        }

        tierLines.push({
          groupId: group.group_id,
          groupName: group.name,
          itemName: pricing.itemName,
          itemCount: pricing.itemCount,
          purchaseUnit: pricing.purchaseUnit,
          purchaseFactor: pricing.purchaseFactor,
          packagePrice: pricing.packagePrice,
          unitCost: pricing.unitCost,
          qtyBase,
          inputQty,
          inputUnit: line.input_unit,
          baseUnit: group.base_unit,
          lineCost: pricing.unitCost === null ? null : roundMoney(qtyBase * pricing.unitCost),
          missing: pricing.unitCost === null,
        })

        if (pricing.unitCost !== null) {
          batchCost += Number(line.qty_base) * pricing.unitCost
        }
      }

      ingredientLines[drinkTier] = tierLines
      if (complete) {
        tierCosts[drinkTier] = roundMoney(batchCost / yieldQty)
      }
    }

    let consumablesCost: number | null = 0
    const consumableLines: SimulatedConsumableLine[] = []
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
          consumableLines.push({
            role: defaultItem.role,
            groupId: defaultItem.group_id,
            groupName: 'Grupo no encontrado',
            qty: null,
            grams: null,
            unitCost: null,
            lineCost: null,
            missing: true,
          })
          complete = false
          continue
        }

        if (defaultItem.role === 'ice') {
          const iceMl = Math.max(0, product.serving_size_ml - liquidMl)
          const iceGrams = iceMl * input.iceDensity
          const iceCost = iceGrams * input.icePricePerGram

          total += iceCost
          consumableLines.push({
            role: 'ice',
            groupId: group.group_id,
            groupName: group.name,
            qty: null,
            grams: iceGrams,
            unitCost: input.icePricePerGram,
            lineCost: roundMoney(iceCost),
            missing: false,
          })
          continue
        }

        const activeItems = itemsByGroup.get(group.group_id) ?? []
        const draft = activeItems.length === 1 ? input.drafts[activeItems[0]!.id] : undefined
        const unitCost =
          draft !== undefined
            ? parseDraftCost(draft)
            : (defaultItem.avg_cost ?? group.reference_cost ?? group.all_avg_cost)

        const qty = defaultItem.qty_base ?? 1

        if (unitCost === null) {
          addGap({
            type: 'consumable',
            label: `Falta precio de ${group.name}`,
            groupId: group.group_id,
            search: group.name,
          })
          consumableLines.push({
            role: defaultItem.role,
            groupId: group.group_id,
            groupName: group.name,
            qty,
            grams: null,
            unitCost: null,
            lineCost: null,
            missing: true,
          })
          complete = false
          continue
        }

        total += qty * unitCost
        consumableLines.push({
          role: defaultItem.role,
          groupId: group.group_id,
          groupName: group.name,
          qty,
          grams: null,
          unitCost,
          lineCost: roundMoney(qty * unitCost),
          missing: false,
        })
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

    const normalDetail: SimulatedTierDetail = {
      tier: 'normal',
      ingredientLines: ingredientLines.normal,
      consumableLines,
      recipeCost: tierCosts.normal,
      consumablesCost,
      totalCost: normalCost,
      margin: normalMargin,
    }

    const premiumDetail: SimulatedTierDetail | null =
      product.premium_price === null
        ? null
        : {
            tier: 'premium',
            ingredientLines: ingredientLines.premium,
            consumableLines,
            recipeCost: tierCosts.premium,
            consumablesCost,
            totalCost: premiumCost,
            margin: premiumMargin,
          }

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
      details: {
        normal: normalDetail,
        premium: premiumDetail,
      },
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
