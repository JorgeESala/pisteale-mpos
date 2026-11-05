import { supabase } from '@/lib/supabase'
import type {
  InventoryCategory,
  InventoryItem,
  Product,
  ProductCategory,
  ProductCost,
  Recipe,
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

export async function fetchInventoryItems(): Promise<InventoryItem[]> {
  const { data, error } = await supabase.from('inventory_items').select('*').order('name')

  if (error) throw error

  return data
}

export async function fetchInventoryItem(id: string): Promise<InventoryItem | null> {
  const { data, error } = await supabase
    .from('inventory_items')
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
