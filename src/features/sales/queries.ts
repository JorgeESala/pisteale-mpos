import { supabase } from '@/lib/supabase'
import type {
  OrderItemView,
  OrderTier,
  OrderView,
  PaymentMethod,
  PaymentView,
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

export async function previewSale(items: SaleItemInput[]): Promise<SaleWarning[]> {
  const { data, error } = await supabase.rpc('preview_sale', {
    p_items: toRpcItems(items),
  })

  if (error) throw error

  return (data as SalePreview).warnings ?? []
}

export type CreateSaleInput = {
  items: SaleItemInput[]
  paymentMethod: PaymentMethod
  reference: string
  tip: number
  notes: string
}

export async function createSale(input: CreateSaleInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_sale', {
    p_items: toRpcItems(input.items),
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
