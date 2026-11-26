import { describe, expect, it } from 'vitest'
import type {
  InventoryGroupCost,
  InventoryItemView,
  Product,
  Recipe,
  RecipeDefaultConsumableView,
  RecipeItem,
} from '@/types/database'
import {
  manualPriceIsNewer,
  simulateProductCosts,
  type PriceDraft,
  type SimulateCostsInput,
} from './simulate-costs'

const now = '2026-11-25T00:00:00.000Z'

function group(
  overrides: Partial<InventoryGroupCost> & Pick<InventoryGroupCost, 'group_id' | 'name'>,
): InventoryGroupCost {
  return {
    category_id: null,
    category_name: null,
    base_unit: 'ml',
    is_tiered: false,
    active: true,
    item_count: 1,
    all_avg_cost: null,
    standard_avg_cost: null,
    premium_avg_cost: null,
    all_cost_count: 0,
    standard_cost_count: 0,
    premium_cost_count: 0,
    reference_cost: null,
    reference_cost_updated_at: null,
    reference_cost_note: '',
    reference_cost_source: '',
    ...overrides,
  }
}

function item(
  overrides: Partial<InventoryItemView> &
    Pick<InventoryItemView, 'id' | 'name' | 'group_id' | 'base_unit'>,
): InventoryItemView {
  return {
    tier: null,
    kind: 'ingrediente',
    purchase_unit: 'botella',
    purchase_factor: 1000,
    avg_cost: 0,
    package_price: 0,
    package_price_updated_at: null,
    min_stock_base: 0,
    track_stock: true,
    active: true,
    created_at: now,
    updated_at: now,
    group_name: '',
    category_id: null,
    category_name: null,
    is_tiered: false,
    recipe_unit_cost: null,
    ...overrides,
  }
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    name: 'Mojito',
    description: '',
    category_id: null,
    kind: 'preparado',
    price: 120,
    premium_price: 150,
    is_alcoholic: true,
    serving_size_ml: 940,
    inventory_item_id: null,
    active: true,
    notes: '',
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'recipe-1',
    product_id: 'product-1',
    yield_qty: 1,
    yield_unit: 'porcion',
    notes: '',
    active: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

function recipeItem(overrides: Partial<RecipeItem> = {}): RecipeItem {
  return {
    id: 'line-1',
    recipe_id: 'recipe-1',
    inventory_group_id: 'ron',
    tier_rule: 'any',
    qty_base: 100,
    input_qty: 100,
    input_unit: 'ml',
    sort_order: 0,
    created_at: now,
    ...overrides,
  }
}

function defaultItem(
  overrides: Partial<RecipeDefaultConsumableView> &
    Pick<RecipeDefaultConsumableView, 'id' | 'group_id' | 'role'>,
): RecipeDefaultConsumableView {
  return {
    group_name: overrides.group_id,
    base_unit: 'pza',
    qty_base: 1,
    applies_to_kind: 'preparado',
    active: true,
    sort_order: 0,
    avg_cost: null,
    all_cost_count: 0,
    ...overrides,
  }
}

function baseInput(): SimulateCostsInput {
  const groups: InventoryGroupCost[] = [
    group({ group_id: 'ron', name: 'Ron' }),
    group({ group_id: 'cup', name: 'Vaso', base_unit: 'pza' }),
    group({ group_id: 'lid', name: 'Tapa', base_unit: 'pza' }),
    group({ group_id: 'straw', name: 'Popote', base_unit: 'pza' }),
    group({ group_id: 'ice', name: 'Hielo', base_unit: 'g' }),
  ]

  const items: InventoryItemView[] = [
    item({ id: 'ron-item', name: 'Ron', group_id: 'ron', base_unit: 'ml' }),
    item({
      id: 'cup-item',
      name: 'Vaso',
      group_id: 'cup',
      base_unit: 'pza',
      purchase_unit: 'caja',
      purchase_factor: 25,
    }),
    item({
      id: 'lid-item',
      name: 'Tapa',
      group_id: 'lid',
      base_unit: 'pza',
      purchase_unit: 'caja',
      purchase_factor: 25,
    }),
    item({
      id: 'straw-item',
      name: 'Popote',
      group_id: 'straw',
      base_unit: 'pza',
      purchase_unit: 'bolsa',
      purchase_factor: 100,
    }),
    item({
      id: 'ice-item',
      name: 'Hielo',
      group_id: 'ice',
      base_unit: 'g',
      purchase_unit: 'bolsa',
      purchase_factor: 5000,
    }),
  ]

  const drafts: Record<string, PriceDraft> = {
    'ron-item': { packagePrice: '100', purchaseUnit: 'botella', purchaseFactor: '1000' },
    'cup-item': { packagePrice: '25', purchaseUnit: 'caja', purchaseFactor: '25' },
    'lid-item': { packagePrice: '12.5', purchaseUnit: 'caja', purchaseFactor: '25' },
    'straw-item': { packagePrice: '10', purchaseUnit: 'bolsa', purchaseFactor: '100' },
  }

  return {
    products: [product()],
    items,
    groups,
    defaults: [
      defaultItem({
        id: 'ice-default',
        group_id: 'ice',
        role: 'ice',
        qty_base: null,
        base_unit: 'g',
      }),
      defaultItem({ id: 'cup-default', group_id: 'cup', role: 'cup' }),
      defaultItem({ id: 'lid-default', group_id: 'lid', role: 'lid' }),
      defaultItem({ id: 'straw-default', group_id: 'straw', role: 'straw' }),
    ],
    recipes: [recipe()],
    recipeItems: [recipeItem()],
    drafts,
    iceDensity: 0.9,
    icePricePerGram: 0.006,
  }
}

describe('simulateProductCosts', () => {
  it('calculates recipe, consumables, fixed ice and margins', () => {
    const [result] = simulateProductCosts(baseInput())

    expect(result).toBeDefined()
    expect(result!.status).toBe('complete')
    expect(result!.normalRecipeCost).toBe(10)
    expect(result!.consumablesCost).toBe(6.14)
    expect(result!.normalCost).toBe(16.14)
    expect(result!.normalMargin).toBe(103.86)
    expect(result!.premiumCost).toBe(16.14)
    expect(result!.premiumMargin).toBe(133.86)

    const detail = result!.details.normal
    expect(detail.ingredientLines).toHaveLength(1)
    expect(detail.ingredientLines[0]).toMatchObject({
      groupName: 'Ron',
      itemName: 'Ron',
      qtyBase: 100,
      unitCost: 0.1,
      lineCost: 10,
      missing: false,
    })
    expect(detail.consumableLines).toHaveLength(4)
    expect(detail.consumableLines.find((line) => line.role === 'ice')).toMatchObject({
      grams: 756,
      lineCost: 4.54,
      missing: false,
    })
    expect(detail.recipeCost).toBe(10)
    expect(detail.consumablesCost).toBe(6.14)
    expect(detail.totalCost).toBe(16.14)
    expect(detail.margin).toBe(103.86)
    expect(result!.details.premium?.totalCost).toBe(16.14)
  })

  it('marks the product pending when an ingredient has no draft price', () => {
    const input = baseInput()
    input.drafts['ron-item'] = {
      packagePrice: '',
      purchaseUnit: 'botella',
      purchaseFactor: '1000',
    }

    const [result] = simulateProductCosts(input)

    expect(result!.status).toBe('pending')
    expect(result!.normalCost).toBeNull()
    expect(result!.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ingredient', label: 'Falta precio de Ron' }),
      ]),
    )
    expect(result!.details.normal.ingredientLines[0]).toMatchObject({
      groupName: 'Ron',
      unitCost: null,
      lineCost: null,
      missing: true,
    })
  })

  it('uses the group reference cost for multi-item groups', () => {
    const input = baseInput()
    input.groups = input.groups.map((candidate) =>
      candidate.group_id === 'ron'
        ? { ...candidate, item_count: 2, reference_cost: 0.2 }
        : candidate,
    )
    input.items.push(
      item({ id: 'ron-premium-item', name: 'Ron premium', group_id: 'ron', base_unit: 'ml' }),
    )
    input.drafts['ron-premium-item'] = {
      packagePrice: '999',
      purchaseUnit: 'botella',
      purchaseFactor: '1000',
    }

    const [result] = simulateProductCosts(input)

    expect(result!.normalRecipeCost).toBe(20)
    expect(result!.normalCost).toBe(26.14)
    expect(result!.details.normal.ingredientLines[0]).toMatchObject({
      groupName: 'Ron',
      itemName: null,
      itemCount: 2,
      unitCost: 0.2,
      lineCost: 20,
      missing: false,
    })
  })

  it('considers a manual price newer than an older purchase', () => {
    const manualItem = item({
      id: 'ron-item',
      name: 'Ron',
      group_id: 'ron',
      base_unit: 'ml',
      package_price: 100,
      package_price_updated_at: '2026-11-25T00:00:00.000Z',
    })

    expect(
      manualPriceIsNewer(manualItem, {
        item_id: 'ron-item',
        item_name: 'Ron',
        group_id: 'ron',
        group_name: 'Ron',
        base_unit: 'ml',
        source: 'event',
        source_label: 'EVT-2026-00001',
        purchased_at: '2026-11-14T00:00:00.000Z',
        purchase_unit: 'botella',
        purchase_factor: 1000,
        qty_purchase: 5,
        qty_base: 5000,
        total_cost: 690,
        unit_cost: 0.138,
        package_price: 138,
        presentation_known: true,
      }),
    ).toBe(true)
  })

  it('marks a product without recipe', () => {
    const input = baseInput()
    input.recipes = []
    input.recipeItems = []

    const [result] = simulateProductCosts(input)

    expect(result!.status).toBe('no_recipe')
    expect(result!.gaps[0]?.label).toBe('Sin receta')
    expect(result!.details.normal.ingredientLines).toEqual([])
    expect(result!.details.normal.totalCost).toBeNull()
  })
})
