import { supabase } from '@/lib/supabase'
import type {
  OrderItemView,
  OrderPromotionView,
  OrderTier,
  OrderView,
  PaymentMethod,
  PaymentView,
  Promotion,
  SalePreview,
  SaleProduct,
  SaleWarning,
} from '@/types/database'

export async function fetchSaleProducts(): Promise<SaleProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id,name,price,premium_price,is_alcoholic')
    .eq('active', true)
    .eq('kind', 'preparado')
    .order('name')

  if (error) throw error

  return data
}

export type SaleItemInput = {
  productId: string
  tier: OrderTier
  qty: number
  notes?: string
}

function toRpcItems(items: SaleItemInput[]) {
  return items.map((item) => ({
    product_id: item.productId,
    tier: item.tier,
    qty: item.qty,
    notes: item.notes ?? '',
  }))
}

export type LinePromotionTarget = {
  promotionId: string
  productId: string
  tier: OrderTier
}

export async function previewSale(
  items: SaleItemInput[],
  promotionIds: string[] = [],
  linePromotion: LinePromotionTarget | null = null,
): Promise<SalePreview> {
  const { data, error } = await supabase.rpc('preview_sale', {
    p_items: toRpcItems(items),
    p_promotion_ids: promotionIds,
    p_line_promotion: linePromotion
      ? {
          promotion_id: linePromotion.promotionId,
          product_id: linePromotion.productId,
          tier: linePromotion.tier,
        }
      : null,
  })

  if (error) throw error

  return data as SalePreview
}

export type CreateSaleInput = {
  items: SaleItemInput[]
  promotionIds: string[]
  linePromotion: LinePromotionTarget | null
  paymentMethod: PaymentMethod
  reference: string
  tip: number
  notes: string
}

export async function createSale(input: CreateSaleInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_sale', {
    p_items: toRpcItems(input.items),
    p_promotion_ids: input.promotionIds,
    p_line_promotion: input.linePromotion
      ? {
          promotion_id: input.linePromotion.promotionId,
          product_id: input.linePromotion.productId,
          tier: input.linePromotion.tier,
        }
      : null,
    p_payment_method: input.paymentMethod,
    p_payment_reference: input.reference,
    p_tip: input.tip,
    p_notes: input.notes,
  })

  if (error) throw error

  return data
}

export async function fetchOrders(limit = 50, from?: string, to?: string): Promise<OrderView[]> {
  let query = supabase
    .from('v_orders')
    .select('*')
    .order('sold_at', { ascending: false })
    .limit(limit)

  if (from) {
    query = query.gte('sale_date', from)
  }

  if (to) {
    query = query.lte('sale_date', to)
  }

  const { data, error } = await query

  if (error) throw error

  return data
}

export async function fetchOrder(id: string): Promise<OrderView | null> {
  const { data, error } = await supabase.from('v_orders').select('*').eq('id', id).maybeSingle()

  if (error) throw error

  return data
}

export async function fetchOrderItems(orderId: string): Promise<OrderItemView[]> {
  const { data, error } = await supabase
    .from('v_order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at')

  if (error) throw error

  return data
}

export async function fetchPayments(orderId: string): Promise<PaymentView[]> {
  const { data, error } = await supabase
    .from('v_payments')
    .select('*')
    .eq('order_id', orderId)
    .order('paid_at')

  if (error) throw error

  return data
}

export async function fetchSalesItems(from?: string, to?: string): Promise<OrderItemView[]> {
  let query = supabase.from('v_order_items').select('*').order('sold_at', { ascending: false })

  if (from) {
    query = query.gte('sale_date', from)
  }

  if (to) {
    query = query.lte('sale_date', to)
  }

  const { data, error } = await query

  if (error) throw error

  return data
}

export function parseSaleWarnings(value: unknown): SaleWarning[] {
  return Array.isArray(value) ? (value as SaleWarning[]) : []
}

export async function fetchPromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select('*')
    .order('sort_order')
    .order('name')

  if (error) throw error

  return data
}

export async function fetchOrderPromotions(orderId: string): Promise<OrderPromotionView[]> {
  const { data, error } = await supabase
    .from('v_order_promotions')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at')

  if (error) throw error

  return data
}

export type UpdatePromotionInput = {
  id: string | null
  name: string
  bundleQty: number
  fixedPrice: number
  appliesTo: Promotion['applies_to']
  appliesToTier: Promotion['applies_to_tier']
  includeCategoryIds: string[]
  excludeCategoryIds: string[]
  automatic: boolean
  active: boolean
  sortOrder: number
  lineTargeted: boolean
  maxPerOrder: number | null
}

export async function upsertPromotion(input: UpdatePromotionInput): Promise<Promotion> {
  const { data, error } = await supabase.rpc('upsert_promotion', {
    p_id: input.id,
    p_name: input.name,
    p_bundle_qty: input.bundleQty,
    p_fixed_price: input.fixedPrice,
    p_applies_to: input.appliesTo,
    p_applies_to_tier: input.appliesToTier,
    p_include_category_ids: input.includeCategoryIds,
    p_exclude_category_ids: input.excludeCategoryIds,
    p_automatic: input.automatic,
    p_active: input.active,
    p_sort_order: input.sortOrder,
    p_line_targeted: input.lineTargeted,
    p_max_per_order: input.maxPerOrder,
  })

  if (error) throw error

  return data
}
