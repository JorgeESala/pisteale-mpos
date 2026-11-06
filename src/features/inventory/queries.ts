import { supabase } from '@/lib/supabase'
import type {
  BottleOpeningStatus,
  BottleOpeningView,
  BottleStock,
  InventoryMovementView,
  InventoryStock,
  InventoryWasteReason,
  InventoryWasteView,
  PurchaseItemView,
  PurchaseView,
} from '@/types/database'

export async function fetchInventoryStock(): Promise<InventoryStock[]> {
  const { data, error } = await supabase.from('v_inventory_stock').select('*').order('name')

  if (error) throw error

  return data
}

export async function fetchInventoryStockItem(itemId: string): Promise<InventoryStock | null> {
  const { data, error } = await supabase
    .from('v_inventory_stock')
    .select('*')
    .eq('item_id', itemId)
    .maybeSingle()

  if (error) throw error

  return data
}

export async function fetchInventoryMovements(
  itemId?: string,
  limit = 100,
): Promise<InventoryMovementView[]> {
  let query = supabase
    .from('v_inventory_movements')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (itemId) {
    query = query.eq('item_id', itemId)
  }

  const { data, error } = await query

  if (error) throw error

  return data
}

export async function fetchPurchases(
  limit = 50,
  from?: string,
  to?: string,
): Promise<PurchaseView[]> {
  let query = supabase
    .from('v_purchases')
    .select('*')
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (from) {
    query = query.gte('purchase_date', from)
  }

  if (to) {
    query = query.lte('purchase_date', to)
  }

  const { data, error } = await query

  if (error) throw error

  return data
}

export async function fetchInventoryWaste(
  from?: string,
  to?: string,
  limit = 200,
): Promise<InventoryWasteView[]> {
  let query = supabase
    .from('v_inventory_waste')
    .select('*')
    .order('waste_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (from) {
    query = query.gte('waste_date', from)
  }

  if (to) {
    query = query.lte('waste_date', to)
  }

  const { data, error } = await query

  if (error) throw error

  return data
}

export type CreateWasteInput = {
  itemId: string
  wasteDate: string
  qty: number
  reason: InventoryWasteReason
  notes: string
}

export async function createInventoryWaste(input: CreateWasteInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_inventory_waste', {
    p_item_id: input.itemId,
    p_waste_date: input.wasteDate,
    p_qty_base: input.qty,
    p_reason: input.reason,
    p_notes: input.notes,
  })

  if (error) throw error

  return data
}

export async function fetchPurchase(id: string): Promise<PurchaseView | null> {
  const { data, error } = await supabase.from('v_purchases').select('*').eq('id', id).maybeSingle()

  if (error) throw error

  return data
}

export async function fetchPurchaseItems(purchaseId: string): Promise<PurchaseItemView[]> {
  const { data, error } = await supabase
    .from('v_purchase_items')
    .select('*')
    .eq('purchase_id', purchaseId)
    .order('created_at')

  if (error) throw error

  return data
}

export type CreatePurchaseItemInput = {
  itemId: string
  qtyPurchase: number
  totalCost: number
}

export type CreatePurchaseInput = {
  purchaseDate: string
  supplier: string
  invoiceRef: string
  notes: string
  items: CreatePurchaseItemInput[]
}

export async function createPurchase(input: CreatePurchaseInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_purchase', {
    p_purchase_date: input.purchaseDate,
    p_supplier: input.supplier,
    p_invoice_ref: input.invoiceRef,
    p_notes: input.notes,
    p_items: input.items.map((item) => ({
      item_id: item.itemId,
      qty_purchase: item.qtyPurchase,
      total_cost: item.totalCost,
    })),
  })

  if (error) throw error

  return data
}

export async function adjustInventoryItem(input: {
  itemId: string
  countedQty: number
  notes: string
}): Promise<number> {
  const { data, error } = await supabase.rpc('adjust_inventory_item', {
    p_item_id: input.itemId,
    p_counted_qty_base: input.countedQty,
    p_notes: input.notes,
  })

  if (error) throw error

  return data
}

export async function fetchBottleStock(): Promise<BottleStock[]> {
  const { data, error } = await supabase.from('v_bottle_stock').select('*').order('name')

  if (error) throw error

  return data
}

export async function fetchBottleOpenings(
  status?: BottleOpeningStatus,
): Promise<BottleOpeningView[]> {
  let query = supabase
    .from('v_bottle_openings')
    .select('*')
    .order('opening_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) throw error

  return data
}

export async function fetchBottleOpening(id: string): Promise<BottleOpeningView | null> {
  const { data, error } = await supabase
    .from('v_bottle_openings')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error

  return data
}

export async function fetchBottleMovements(bottleId: string): Promise<InventoryMovementView[]> {
  const { data, error } = await supabase
    .from('v_inventory_movements')
    .select('*')
    .eq('bottle_opening_id', bottleId)
    .order('occurred_at', { ascending: false })

  if (error) throw error

  return data
}

export type OpenBottleInput = {
  itemId: string
  openingDate: string
  initialMl: number
  notes: string
}

export async function openBottle(input: OpenBottleInput): Promise<string> {
  const { data, error } = await supabase.rpc('open_bottle', {
    p_item_id: input.itemId,
    p_opening_date: input.openingDate,
    p_initial_ml: input.initialMl,
    p_notes: input.notes,
  })

  if (error) throw error

  return data
}

export async function consumeOpenBottle(input: {
  bottleId: string
  qtyMl: number
  notes: string
}): Promise<number> {
  const { data, error } = await supabase.rpc('consume_open_bottle', {
    p_bottle_id: input.bottleId,
    p_qty_ml: input.qtyMl,
    p_notes: input.notes,
  })

  if (error) throw error

  return data
}

export async function closeOpenBottle(input: {
  bottleId: string
  leftoverMl: number
  notes: string
}): Promise<void> {
  const { error } = await supabase.rpc('close_open_bottle', {
    p_bottle_id: input.bottleId,
    p_leftover_ml: input.leftoverMl,
    p_notes: input.notes,
  })

  if (error) throw error
}
