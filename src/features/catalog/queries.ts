import { supabase } from '@/lib/supabase'
import type {
  IceCost7d,
  IceDailyRecordView,
  InventoryCategory,
  InventoryGroup,
  InventoryGroupCost,
  InventoryItemView,
  Product,
  ProductCategory,
  ProductCost,
  Recipe,
  RecipeDefaultConsumableView,
  RecipeItem,
} from '@/types/database'

export async function fetchProducts(): Promise<ProductCost[]> {
  const { data, error } = await supabase.from('v_product_costs').select('*').order('name')

  if (error) throw error

  return data
}

export async function fetchProduct(id: string): Promise<Product | null> {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle()

  if (error) throw error

  return data
}

export async function fetchProductCategories(): Promise<ProductCategory[]> {
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .order('sort_order')
    .order('name')

  if (error) throw error

  return data
}

export async function fetchInventoryCategories(): Promise<InventoryCategory[]> {
  const { data, error } = await supabase
    .from('inventory_categories')
    .select('*')
    .order('sort_order')
    .order('name')

  if (error) throw error

  return data
}

export async function fetchInventoryGroups(): Promise<InventoryGroupCost[]> {
  const { data, error } = await supabase.from('v_inventory_group_costs').select('*').order('name')

  if (error) throw error

  return data
}

export async function fetchInventoryGroup(id: string): Promise<InventoryGroup | null> {
  const { data, error } = await supabase
    .from('inventory_item_groups')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error

  return data
}

export async function fetchInventoryItems(): Promise<InventoryItemView[]> {
  const { data, error } = await supabase.from('v_inventory_items').select('*').order('name')

  if (error) throw error

  return data
}

export async function fetchInventoryItem(id: string): Promise<InventoryItemView | null> {
  const { data, error } = await supabase
    .from('v_inventory_items')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error

  return data
}

export async function fetchRecipe(productId: string): Promise<Recipe | null> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle()

  if (error) throw error

  return data
}

export async function fetchRecipeItems(recipeId: string): Promise<RecipeItem[]> {
  const { data, error } = await supabase
    .from('recipe_items')
    .select('*')
    .eq('recipe_id', recipeId)
    .order('sort_order')

  if (error) throw error

  return data
}

export async function fetchDefaultConsumables(): Promise<RecipeDefaultConsumableView[]> {
  const { data, error } = await supabase
    .from('v_recipe_default_consumables')
    .select('*')
    .order('sort_order')

  if (error) throw error

  return data
}

export async function fetchIceDensity(): Promise<number> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'ice_density_g_per_ml')
    .maybeSingle()

  if (error) throw error

  return typeof data?.value === 'number' ? data.value : 0.9
}

export async function fetchIceDailyRecords(): Promise<IceDailyRecordView[]> {
  const { data, error } = await supabase
    .from('v_ice_daily_records')
    .select('*')
    .order('record_date', { ascending: false })
    .limit(30)

  if (error) throw error

  return data
}

export async function fetchIceCost7d(): Promise<IceCost7d> {
  const { data, error } = await supabase.from('v_ice_cost_7d').select('*').maybeSingle()

  if (error) throw error

  return (
    data ?? {
      days_count: 0,
      date_from: null,
      date_to: null,
      cost_per_drink: null,
    }
  )
}

type IceDailyRecordInput = {
  id: string | null
  recordDate: string
  bags: number | null
  totalCost: number
  drinksSold: number
  notes: string
}

export async function upsertIceDailyRecord(input: IceDailyRecordInput): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_ice_daily_record', {
    p_id: input.id,
    p_record_date: input.recordDate,
    p_bags: input.bags,
    p_total_cost: input.totalCost,
    p_drinks_sold: input.drinksSold,
    p_notes: input.notes,
  })

  if (error) throw error

  return data
}

export async function deleteIceDailyRecord(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_ice_daily_record', { p_id: id })

  if (error) throw error
}
