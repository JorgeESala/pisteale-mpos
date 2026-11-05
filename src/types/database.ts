export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'admin' | 'operador' | 'consulta'
export type ProductKind = 'preparado' | 'botella' | 'servicio'
export type InventoryKind = 'ingrediente' | 'consumible' | 'botella' | 'preparacion'
export type BaseUnit = 'ml' | 'g' | 'pza'

export type Profile = {
  id: string
  full_name: string
  role: UserRole
  can_view_financials: boolean
  can_adjust_inventory: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export type AppSetting = {
  key: string
  value: Json
  updated_at: string
  updated_by: string | null
}

export type AuditLog = {
  id: number
  user_id: string | null
  action: string
  table_name: string
  record_id: string | null
  old_data: Json | null
  new_data: Json | null
  created_at: string
}

export type ProductCategory = {
  id: string
  name: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export type InventoryCategory = {
  id: string
  name: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export type InventoryItem = {
  id: string
  name: string
  category_id: string | null
  kind: InventoryKind
  base_unit: BaseUnit
  purchase_unit: string
  purchase_factor: number
  avg_cost: number
  min_stock_base: number
  track_stock: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export type Product = {
  id: string
  name: string
  description: string
  category_id: string | null
  kind: ProductKind
  price: number
  is_alcoholic: boolean
  serving_size_ml: number
  inventory_item_id: string | null
  active: boolean
  notes: string
  created_at: string
  updated_at: string
}

export type ProductAlias = {
  id: string
  product_id: string
  alias: string
  created_at: string
}

export type Recipe = {
  id: string
  product_id: string
  yield_qty: number
  yield_unit: string
  notes: string
  active: boolean
  created_at: string
  updated_at: string
}

export type RecipeItem = {
  id: string
  recipe_id: string
  inventory_item_id: string
  qty_base: number
  sort_order: number
  created_at: string
}

export type ProductCost = {
  product_id: string
  name: string
  category_id: string | null
  category_name: string | null
  price: number
  is_alcoholic: boolean
  active: boolean
  estimated_cost: number | null
  estimated_margin: number | null
  has_recipe: boolean
  cost_complete: boolean
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: never
        Update: never
        Relationships: []
      }
      app_settings: {
        Row: AppSetting
        Insert: never
        Update: never
        Relationships: []
      }
      audit_log: {
        Row: AuditLog
        Insert: never
        Update: never
        Relationships: []
      }
      product_categories: {
        Row: ProductCategory
        Insert: never
        Update: never
        Relationships: []
      }
      inventory_categories: {
        Row: InventoryCategory
        Insert: never
        Update: never
        Relationships: []
      }
      inventory_items: {
        Row: InventoryItem
        Insert: never
        Update: never
        Relationships: []
      }
      products: {
        Row: Product
        Insert: never
        Update: never
        Relationships: []
      }
      product_aliases: {
        Row: ProductAlias
        Insert: never
        Update: never
        Relationships: []
      }
      recipes: {
        Row: Recipe
        Insert: never
        Update: never
        Relationships: []
      }
      recipe_items: {
        Row: RecipeItem
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: {
      v_product_costs: {
        Row: ProductCost
        Relationships: []
      }
    }
    Functions: {
      ping: {
        Args: Record<string, never>
        Returns: Json
      }
      update_my_profile: {
        Args: { p_full_name: string }
        Returns: Profile
      }
      admin_update_profile_name: {
        Args: { p_user_id: string; p_full_name: string }
        Returns: Profile
      }
      upsert_inventory_item: {
        Args: {
          p_id: string | null
          p_name: string
          p_category_id: string | null
          p_kind: InventoryKind
          p_base_unit: BaseUnit
          p_purchase_unit: string
          p_purchase_factor: number
          p_avg_cost: number
          p_min_stock_base: number
          p_track_stock: boolean
          p_active: boolean
        }
        Returns: InventoryItem
      }
      upsert_product: {
        Args: {
          p_id: string | null
          p_name: string
          p_description: string
          p_category_id: string | null
          p_kind: ProductKind
          p_price: number
          p_is_alcoholic: boolean
          p_serving_size_ml: number
          p_inventory_item_id: string | null
          p_active: boolean
          p_notes: string
        }
        Returns: Product
      }
      upsert_recipe: {
        Args: {
          p_product_id: string
          p_yield_qty: number
          p_yield_unit: string
          p_notes: string
          p_items: Json
        }
        Returns: Recipe
      }
    }
    Enums: {
      user_role: UserRole
    }
    CompositeTypes: Record<string, never>
  }
}
