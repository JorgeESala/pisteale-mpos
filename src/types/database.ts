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
  can_manage_catalog: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export type AdminUser = {
  id: string
  full_name: string
  email: string | null
  role: UserRole
  active: boolean
  can_view_financials: boolean
  can_adjust_inventory: boolean
  can_manage_catalog: boolean
  created_at: string
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

export type InventoryStockStatus = 'ok' | 'low' | 'out' | 'negative' | 'no_stock'

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
  bottle_opening_id: string | null
  order_id: string | null
  order_item_id: string | null
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
  order_folio: string | null
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

export type BottleOpeningStatus = 'open' | 'finished'

export type BottleOpening = {
  id: string
  item_id: string
  opening_date: string
  initial_ml: number
  remaining_ml: number
  status: BottleOpeningStatus
  opened_at: string
  finished_at: string | null
  notes: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type BottleOpeningView = BottleOpening & {
  item_name: string
  group_id: string
  group_name: string
  category_name: string | null
  base_unit: BaseUnit
  avg_cost: number
  consumed_ml: number
  remaining_value: number
  created_by_name: string | null
}

export type BottleStock = {
  item_id: string
  name: string
  group_id: string
  group_name: string
  category_name: string | null
  base_unit: BaseUnit
  purchase_unit: string
  purchase_factor: number
  avg_cost: number
  track_stock: boolean
  active: boolean
  current_stock_ml: number
  open_ml: number
  sealed_ml: number
  open_count: number
  open_value: number
}

export type OrderStatus = 'paid' | 'cancelled'
export type OrderTier = 'normal' | 'premium'
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other'

export type SaleProduct = {
  id: string
  name: string
  price: number
  premium_price: number | null
  is_alcoholic: boolean
}

export type Order = {
  id: string
  folio: string
  sold_at: string
  status: OrderStatus
  gross_total: number
  discount_total: number
  subtotal: number
  tip_total: number
  total: number
  cost_total: number | null
  inventory_warnings: Json
  notes: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type OrderView = Order & {
  sale_date: string
  margin: number | null
  item_count: number
  payment_methods: string | null
  payment_total: number
  warning_count: number
  promotion_count: number
  created_by_name: string | null
}

export type OrderItem = {
  id: string
  order_id: string
  product_id: string
  product_name: string
  tier: OrderTier
  quantity: number
  unit_price: number
  line_total: number
  unit_cost: number | null
  line_cost: number | null
  notes: string
  created_at: string
}

export type OrderItemView = OrderItem & {
  folio: string
  sold_at: string
  sale_date: string
}

export type Payment = {
  id: string
  order_id: string
  method: PaymentMethod
  amount: number
  tip_amount: number
  reference: string
  paid_at: string
  created_by: string | null
  created_at: string
}

export type PaymentView = Payment & {
  folio: string
  created_by_name: string | null
}

export type SaleStockWarning = {
  type: 'stock'
  scope: 'recipe' | 'consumable'
  group_id: string
  group_name: string
  required_base: number
  available_base: number
  missing_base: number
  base_unit: BaseUnit
  role?: 'cup' | 'lid' | 'straw'
}

export type SaleNoRecipeWarning = {
  type: 'no_recipe'
  product_id: string
  product_name: string
}

export type SaleCostPendingWarning = {
  type: 'cost_pending'
  product_id: string
  product_name: string
}

export type SaleWarning = SaleStockWarning | SaleNoRecipeWarning | SaleCostPendingWarning

export type Promotion = {
  id: string
  name: string
  bundle_qty: number
  fixed_price: number
  applies_to: 'any' | 'alcoholic' | 'non_alcoholic'
  applies_to_tier: 'any' | 'normal' | 'premium'
  include_category_ids: string[]
  exclude_category_ids: string[]
  automatic: boolean
  active: boolean
  sort_order: number
  line_targeted: boolean
  max_per_order: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type SalePromotionApplication = {
  promotion_id: string
  promotion_name: string
  automatic: boolean
  line_targeted: boolean
  bundle_qty: number
  applications: number
  gross_amount: number
  discount_amount: number
}

export type OrderPromotion = {
  id: string
  order_id: string
  promotion_id: string | null
  promotion_name: string
  automatic: boolean
  line_targeted: boolean
  bundle_qty: number
  applications: number
  gross_amount: number
  discount_amount: number
  created_at: string
}

export type OrderPromotionView = OrderPromotion & {
  folio: string
  sold_at: string
}

export type SalePreview = {
  warnings: SaleWarning[]
  gross_total: number
  discount_total: number
  subtotal: number
  promotions: SalePromotionApplication[]
}

export type EventStatus = 'open' | 'closed'

export type EventExpenseCategory =
  'supplies' | 'ice' | 'transport' | 'staff' | 'permits' | 'rent' | 'other'

export type Event = {
  id: string
  folio: string
  name: string
  venue: string
  event_date: string
  start_time: string | null
  end_time: string | null
  status: EventStatus
  promotion_enabled: boolean
  bundle_qty: number
  bundle_price: number
  opening_cash: number
  notes: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type EventView = Event & {
  created_by_name: string | null
  sales_count: number
  drinks_count: number
  gross_sales: number
  discount_total: number
  sales_total: number
  expenses_total: number
  expenses_count: number
  profit: number
  margin_percent: number | null
}

export type EventSale = {
  id: string
  client_id: string
  event_id: string
  sold_at: string
  payment_method: PaymentMethod
  gross_total: number
  discount_total: number
  total: number
  notes: string
  created_by: string | null
  created_at: string
}

export type EventSaleView = EventSale & {
  event_folio: string
  event_name: string
  event_date: string
  created_by_name: string | null
  item_count: number
  drinks_count: number
}

export type EventSaleItem = {
  id: string
  event_sale_id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
  promotion_eligible: boolean
  notes: string
  created_at: string
}

export type EventSaleItemView = EventSaleItem & {
  event_id: string
  event_folio: string
  sold_at: string
}

export type EventExpense = {
  id: string
  client_id: string
  event_id: string
  category: EventExpenseCategory
  description: string
  amount: number
  payment_method: PaymentMethod
  reference: string
  spent_at: string
  notes: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type EventExpenseView = EventExpense & {
  event_folio: string
  event_name: string
  created_by_name: string | null
}

export type EventProduct = {
  id: string
  name: string
  price: number
  premium_price: number | null
  kind: ProductKind
  is_alcoholic: boolean
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
      bottle_openings: {
        Row: BottleOpening
        Insert: never
        Update: never
        Relationships: []
      }
      orders: {
        Row: Order
        Insert: never
        Update: never
        Relationships: []
      }
      order_items: {
        Row: OrderItem
        Insert: never
        Update: never
        Relationships: []
      }
      payments: {
        Row: Payment
        Insert: never
        Update: never
        Relationships: []
      }
      promotions: {
        Row: Promotion
        Insert: never
        Update: never
        Relationships: []
      }
      order_promotions: {
        Row: OrderPromotion
        Insert: never
        Update: never
        Relationships: []
      }
      events: {
        Row: Event
        Insert: never
        Update: never
        Relationships: []
      }
      event_sales: {
        Row: EventSale
        Insert: never
        Update: never
        Relationships: []
      }
      event_sale_items: {
        Row: EventSaleItem
        Insert: never
        Update: never
        Relationships: []
      }
      event_expenses: {
        Row: EventExpense
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
      v_bottle_openings: {
        Row: BottleOpeningView
        Relationships: []
      }
      v_bottle_stock: {
        Row: BottleStock
        Relationships: []
      }
      v_orders: {
        Row: OrderView
        Relationships: []
      }
      v_order_items: {
        Row: OrderItemView
        Relationships: []
      }
      v_payments: {
        Row: PaymentView
        Relationships: []
      }
      v_order_promotions: {
        Row: OrderPromotionView
        Relationships: []
      }
      v_events: {
        Row: EventView
        Relationships: []
      }
      v_event_sales: {
        Row: EventSaleView
        Relationships: []
      }
      v_event_sale_items: {
        Row: EventSaleItemView
        Relationships: []
      }
      v_event_expenses: {
        Row: EventExpenseView
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
      open_bottle: {
        Args: {
          p_item_id: string
          p_opening_date: string
          p_initial_ml: number
          p_notes: string
        }
        Returns: string
      }
      consume_open_bottle: {
        Args: {
          p_bottle_id: string
          p_qty_ml: number
          p_notes: string
        }
        Returns: number
      }
      close_open_bottle: {
        Args: {
          p_bottle_id: string
          p_leftover_ml: number
          p_notes: string
        }
        Returns: undefined
      }
      preview_sale: {
        Args: {
          p_items: Json
          p_promotion_ids: string[]
          p_line_promotion: Json | null
        }
        Returns: SalePreview
      }
      create_sale: {
        Args: {
          p_items: Json
          p_promotion_ids: string[]
          p_line_promotion: Json | null
          p_payment_method: PaymentMethod
          p_payment_reference: string
          p_tip: number
          p_notes: string
        }
        Returns: string
      }
      create_event: {
        Args: {
          p_name: string
          p_venue: string
          p_event_date: string
          p_start_time: string | null
          p_end_time: string | null
          p_promotion_enabled: boolean
          p_bundle_qty: number
          p_bundle_price: number
          p_opening_cash: number
          p_notes: string
        }
        Returns: string
      }
      update_event: {
        Args: {
          p_id: string
          p_name: string
          p_venue: string
          p_event_date: string
          p_start_time: string | null
          p_end_time: string | null
          p_promotion_enabled: boolean
          p_bundle_qty: number
          p_bundle_price: number
          p_opening_cash: number
          p_notes: string
        }
        Returns: string
      }
      set_event_status: {
        Args: { p_id: string; p_status: EventStatus }
        Returns: string
      }
      create_event_sale: {
        Args: {
          p_client_id: string
          p_event_id: string
          p_items: Json
          p_apply_promotion: boolean
          p_payment_method: PaymentMethod
          p_notes: string
          p_sold_at: string
        }
        Returns: string
      }
      delete_event_sale: {
        Args: { p_id: string }
        Returns: undefined
      }
      upsert_event_expense: {
        Args: {
          p_id: string | null
          p_client_id: string
          p_event_id: string
          p_category: EventExpenseCategory
          p_description: string
          p_amount: number
          p_payment_method: PaymentMethod
          p_reference: string
          p_spent_at: string
          p_notes: string
        }
        Returns: string
      }
      delete_event_expense: {
        Args: { p_id: string }
        Returns: undefined
      }
      upsert_promotion: {
        Args: {
          p_id: string | null
          p_name: string
          p_bundle_qty: number
          p_fixed_price: number
          p_applies_to: 'any' | 'alcoholic' | 'non_alcoholic'
          p_applies_to_tier: 'any' | 'normal' | 'premium'
          p_include_category_ids: string[]
          p_exclude_category_ids: string[]
          p_automatic: boolean
          p_active: boolean
          p_sort_order: number
          p_line_targeted: boolean
          p_max_per_order: number | null
        }
        Returns: Promotion
      }
      update_my_profile: {
        Args: { p_full_name: string }
        Returns: Profile
      }
      admin_update_profile_name: {
        Args: { p_user_id: string; p_full_name: string }
        Returns: Profile
      }
      admin_set_profile: {
        Args: {
          p_user_id: string
          p_role: UserRole
          p_active: boolean
          p_can_view_financials: boolean
          p_can_adjust_inventory: boolean
          p_can_manage_catalog: boolean
        }
        Returns: Profile
      }
      admin_list_users: {
        Args: Record<string, never>
        Returns: AdminUser[]
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
