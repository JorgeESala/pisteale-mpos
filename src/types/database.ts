export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'admin' | 'operador' | 'consulta'
export type ProductKind = 'preparado' | 'botella' | 'servicio'
export type InventoryKind = 'ingrediente' | 'consumible' | 'botella' | 'preparacion'
export type BaseUnit = 'ml' | 'g' | 'pza'
export type InventoryTier = 'estandar' | 'premium'
export type RecipeTierRule = 'any' | 'estandar' | 'premium' | 'match'
export type RecipeInputUnit = 'ml' | 'oz' | 'g' | 'pza'
export type DefaultConsumableRole = 'ice' | 'cup' | 'lid' | 'straw'

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

export type InventoryGroup = {
  id: string
  name: string
  category_id: string | null
  base_unit: BaseUnit
  is_tiered: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export type InventoryGroupCost = {
  group_id: string
  name: string
  category_id: string | null
  category_name: string | null
  base_unit: BaseUnit
  is_tiered: boolean
  active: boolean
  item_count: number
  all_avg_cost: number | null
  standard_avg_cost: number | null
  premium_avg_cost: number | null
  all_cost_count: number
  standard_cost_count: number
  premium_cost_count: number
}

export type InventoryItem = {
  id: string
  name: string
  group_id: string
  tier: InventoryTier | null
  kind: InventoryKind
  purchase_unit: string
  purchase_factor: number
  avg_cost: number
  min_stock_base: number
  track_stock: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export type InventoryItemView = InventoryItem & {
  group_name: string
  category_id: string | null
  category_name: string | null
  base_unit: BaseUnit
  is_tiered: boolean
}

export type Product = {
  id: string
  name: string
  description: string
  category_id: string | null
  kind: ProductKind
  price: number
  premium_price: number | null
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
  inventory_group_id: string
  tier_rule: RecipeTierRule
  qty_base: number
  input_qty: number | null
  input_unit: RecipeInputUnit | null
  sort_order: number
  created_at: string
}

export type RecipeDefaultConsumable = {
  id: string
  inventory_group_id: string
  role: DefaultConsumableRole
  qty_base: number | null
  applies_to_kind: ProductKind
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type RecipeDefaultConsumableView = {
  id: string
  group_id: string
  group_name: string
  base_unit: BaseUnit
  role: DefaultConsumableRole
  qty_base: number | null
  applies_to_kind: ProductKind
  active: boolean
  sort_order: number
  avg_cost: number | null
  all_cost_count: number
}

export type IceDailyRecord = {
  id: string
  record_date: string
  bags: number | null
  total_cost: number
  drinks_sold: number
  notes: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type IceDailyRecordView = IceDailyRecord & {
  cost_per_drink: number
}

export type IceCost7d = {
  days_count: number
  date_from: string | null
  date_to: string | null
  cost_per_drink: number | null
}

export type InventoryMovementType =
  'purchase' | 'adjustment' | 'opening' | 'consumption' | 'waste' | 'transfer'

export type InventoryStockStatus = 'ok' | 'low' | 'out' | 'no_stock'

export type Purchase = {
  id: string
  folio: string
  purchase_date: string
  supplier: string
  invoice_ref: string
  notes: string
  total_cost: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PurchaseView = Purchase & {
  item_count: number
  created_by_name: string | null
}

export type PurchaseItem = {
  id: string
  purchase_id: string
  item_id: string
  purchase_unit: string
  purchase_factor: number
  qty_purchase: number
  qty_base: number
  total_cost: number
  created_at: string
}

export type PurchaseItemView = PurchaseItem & {
  item_name: string
  group_id: string
  group_name: string
  base_unit: BaseUnit
  unit_cost_base: number
}

export type InventoryMovement = {
  id: string
  item_id: string
  movement_type: InventoryMovementType
  qty_base: number
  unit_cost: number
  total_cost: number
  purchase_id: string | null
  notes: string
  occurred_at: string
  created_by: string | null
  created_at: string
}

export type InventoryMovementView = InventoryMovement & {
  item_name: string
  group_id: string
  group_name: string
  base_unit: BaseUnit
  purchase_folio: string | null
  created_by_name: string | null
}

export type InventoryStock = {
  item_id: string
  name: string
  group_id: string
  group_name: string
  category_name: string | null
  base_unit: BaseUnit
  tier: InventoryTier | null
  kind: InventoryKind
  purchase_unit: string
  purchase_factor: number
  avg_cost: number
  min_stock_base: number
  track_stock: boolean
  active: boolean
  current_qty_base: number
  stock_qty_base: number | null
  stock_value: number
  stock_status: InventoryStockStatus
}

export type InventoryWasteReason = 'fondo_botella' | 'producto_vencido' | 'derrame' | 'otro'

export type InventoryWaste = {
  id: string
  waste_date: string
  item_id: string
  qty_base: number
  reason: InventoryWasteReason
  unit_cost: number
  total_cost: number
  movement_id: string
  notes: string
  created_by: string | null
  created_at: string
}

export type InventoryWasteView = InventoryWaste & {
  item_name: string
  group_id: string
  group_name: string
  category_name: string | null
  base_unit: BaseUnit
  created_by_name: string | null
}

export type ProductCost = {
  product_id: string
  name: string
  category_id: string | null
  category_name: string | null
  price: number
  premium_price: number | null
  is_alcoholic: boolean
  active: boolean
  normal_recipe_cost: number | null
  premium_recipe_cost: number | null
  consumables_cost: number | null
  normal_cost: number | null
  normal_margin: number | null
  premium_cost: number | null
  premium_margin: number | null
  normal_cost_complete: boolean
  premium_cost_complete: boolean
  has_recipe: boolean
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
      inventory_item_groups: {
        Row: InventoryGroup
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
      recipe_default_consumables: {
        Row: RecipeDefaultConsumable
        Insert: never
        Update: never
        Relationships: []
      }
      ice_daily_records: {
        Row: IceDailyRecord
        Insert: never
        Update: never
        Relationships: []
      }
      purchases: {
        Row: Purchase
        Insert: never
        Update: never
        Relationships: []
      }
      purchase_items: {
        Row: PurchaseItem
        Insert: never
        Update: never
        Relationships: []
      }
      inventory_movements: {
        Row: InventoryMovement
        Insert: never
        Update: never
        Relationships: []
      }
      inventory_waste: {
        Row: InventoryWaste
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: {
      v_ice_daily_records: {
        Row: IceDailyRecordView
        Relationships: []
      }
      v_ice_cost_7d: {
        Row: IceCost7d
        Relationships: []
      }
      v_inventory_stock: {
        Row: InventoryStock
        Relationships: []
      }
      v_inventory_movements: {
        Row: InventoryMovementView
        Relationships: []
      }
      v_purchases: {
        Row: PurchaseView
        Relationships: []
      }
      v_purchase_items: {
        Row: PurchaseItemView
        Relationships: []
      }
      v_inventory_waste: {
        Row: InventoryWasteView
        Relationships: []
      }
      v_inventory_group_costs: {
        Row: InventoryGroupCost
        Relationships: []
      }
      v_inventory_items: {
        Row: InventoryItemView
        Relationships: []
      }
      v_product_costs: {
        Row: ProductCost
        Relationships: []
      }
      v_recipe_default_consumables: {
        Row: RecipeDefaultConsumableView
        Relationships: []
      }
    }
    Functions: {
      ping: {
        Args: Record<string, never>
        Returns: Json
      }
      product_cost: {
        Args: { p_product_id: string; p_tier: string }
        Returns: number | null
      }
      product_recipe_cost: {
        Args: { p_product_id: string; p_tier: string }
        Returns: number | null
      }
      product_consumables_cost: {
        Args: { p_product_id: string }
        Returns: number | null
      }
      save_recipe_default_consumables: {
        Args: { p_items: Json; p_ice_density: number }
        Returns: undefined
      }
      upsert_ice_daily_record: {
        Args: {
          p_id: string | null
          p_record_date: string
          p_bags: number | null
          p_total_cost: number
          p_drinks_sold: number
          p_notes: string
        }
        Returns: string
      }
      delete_ice_daily_record: {
        Args: { p_id: string }
        Returns: undefined
      }
      adjust_inventory_item: {
        Args: {
          p_item_id: string
          p_counted_qty_base: number
          p_notes: string
        }
        Returns: number
      }
      create_purchase: {
        Args: {
          p_purchase_date: string
          p_supplier: string
          p_invoice_ref: string
          p_notes: string
          p_items: Json
        }
        Returns: string
      }
      create_inventory_waste: {
        Args: {
          p_item_id: string
          p_waste_date: string
          p_qty_base: number
          p_reason: InventoryWasteReason
          p_notes: string
        }
        Returns: string
      }
      update_my_profile: {
        Args: { p_full_name: string }
        Returns: Profile
      }
      admin_update_profile_name: {
        Args: { p_user_id: string; p_full_name: string }
        Returns: Profile
      }
      upsert_inventory_group: {
        Args: {
          p_id: string | null
          p_name: string
          p_category_id: string | null
          p_base_unit: BaseUnit
          p_is_tiered: boolean
          p_active: boolean
        }
        Returns: InventoryGroup
      }
      upsert_inventory_item: {
        Args: {
          p_id: string | null
          p_group_id: string
          p_name: string
          p_tier: InventoryTier | null
          p_kind: InventoryKind
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
          p_premium_price: number | null
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
