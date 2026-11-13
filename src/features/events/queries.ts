import { supabase } from '@/lib/supabase'
import type {
  EventExpenseCategory,
  EventInventoryLoadView,
  EventInventoryMovementView,
  EventInventoryStock,
  EventProduct,
  EventStatus,
  EventView,
  PaymentMethod,
} from '@/types/database'
import { isConnectivityError } from './connectivity'
import {
  isOffline,
  loadEventDetailCache,
  loadEventListCache,
  loadEventProductsCache,
  saveEventDetailCache,
  saveEventListCache,
  saveEventProductsCache,
  type EventBundle,
} from './event-cache'
import type { EventSaleLineInput } from './event-pricing'

export { isConnectivityError } from './connectivity'

export async function fetchEventProducts(userId: string): Promise<EventProduct[]> {
  if (isOffline()) {
    const cached = loadEventProductsCache(userId)
    if (cached) return cached

    throw new Error('Sin conexión y sin catálogo guardado. Abre el evento con internet.')
  }

  const { data, error } = await supabase
    .from('products')
    .select('id,name,price,kind,is_alcoholic')
    .eq('active', true)
    .order('name')

  if (error) {
    const cached = loadEventProductsCache(userId)
    if (cached && isConnectivityError(error)) return cached
    throw error
  }

  saveEventProductsCache(userId, data)
  return data
}

export async function fetchEvents(userId: string): Promise<EventView[]> {
  if (isOffline()) {
    const cached = loadEventListCache(userId)
    if (cached) return cached

    throw new Error('Sin conexión y sin eventos guardados.')
  }

  const { data, error } = await supabase
    .from('v_events')
    .select('*')
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    const cached = loadEventListCache(userId)
    if (cached && isConnectivityError(error)) return cached
    throw error
  }

  saveEventListCache(userId, data)
  return data
}

export async function fetchEventBundle(userId: string, eventId: string): Promise<EventBundle> {
  if (isOffline()) {
    const cached = loadEventDetailCache(userId, eventId)
    if (cached) return cached

    throw new Error('Sin conexión y sin datos del evento. Ábrelo con internet antes de salir.')
  }

  try {
    const [eventResult, salesResult, itemsResult, expensesResult] = await Promise.all([
      supabase.from('v_events').select('*').eq('id', eventId).maybeSingle(),
      supabase
        .from('v_event_sales')
        .select('*')
        .eq('event_id', eventId)
        .order('sold_at', { ascending: false }),
      supabase.from('v_event_sale_items').select('*').eq('event_id', eventId).order('created_at'),
      supabase
        .from('v_event_expenses')
        .select('*')
        .eq('event_id', eventId)
        .order('spent_at', { ascending: false }),
    ])

    if (eventResult.error) throw eventResult.error
    if (salesResult.error) throw salesResult.error
    if (itemsResult.error) throw itemsResult.error
    if (expensesResult.error) throw expensesResult.error

    if (!eventResult.data) {
      throw new Error('Evento no encontrado')
    }

    const bundle: EventBundle = {
      event: eventResult.data,
      sales: salesResult.data,
      saleItems: itemsResult.data,
      expenses: expensesResult.data,
    }

    saveEventDetailCache(userId, bundle)

    const cachedList = loadEventListCache(userId)
    if (cachedList) {
      saveEventListCache(
        userId,
        cachedList.map((candidate) =>
          candidate.id === bundle.event.id ? bundle.event : candidate,
        ),
      )
    }

    return bundle
  } catch (error) {
    const cached = loadEventDetailCache(userId, eventId)
    if (cached && isConnectivityError(error)) return cached
    throw error
  }
}

export type CreateEventInput = {
  name: string
  venue: string
  eventDate: string
  startTime: string | null
  endTime: string | null
  promotionEnabled: boolean
  bundleQty: number
  bundlePrice: number
  openingCash: number
  notes: string
}

export async function createEvent(input: CreateEventInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_event', {
    p_name: input.name,
    p_venue: input.venue,
    p_event_date: input.eventDate,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_promotion_enabled: input.promotionEnabled,
    p_bundle_qty: input.bundleQty,
    p_bundle_price: input.bundlePrice,
    p_opening_cash: input.openingCash,
    p_notes: input.notes,
  })

  if (error) throw error

  return data
}

export type UpdateEventInput = CreateEventInput & { id: string }

export async function updateEvent(input: UpdateEventInput): Promise<string> {
  const { data, error } = await supabase.rpc('update_event', {
    p_id: input.id,
    p_name: input.name,
    p_venue: input.venue,
    p_event_date: input.eventDate,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_promotion_enabled: input.promotionEnabled,
    p_bundle_qty: input.bundleQty,
    p_bundle_price: input.bundlePrice,
    p_opening_cash: input.openingCash,
    p_notes: input.notes,
  })

  if (error) throw error

  return data
}

export async function setEventStatus(eventId: string, status: EventStatus): Promise<string> {
  const { data, error } = await supabase.rpc('set_event_status', {
    p_id: eventId,
    p_status: status,
  })

  if (error) throw error

  return data
}

export type CreateEventSaleInput = {
  clientId: string
  eventId: string
  items: EventSaleLineInput[]
  applyPromotion: boolean
  bundleQty: number
  bundlePrice: number
  paymentMethod: PaymentMethod
  notes: string
  soldAt: string
}

export async function createEventSale(input: CreateEventSaleInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_event_sale', {
    p_client_id: input.clientId,
    p_event_id: input.eventId,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      promotion_eligible: item.promotionEligible,
    })),
    p_apply_promotion: input.applyPromotion,
    p_bundle_qty: input.bundleQty,
    p_bundle_price: input.bundlePrice,
    p_payment_method: input.paymentMethod,
    p_notes: input.notes,
    p_sold_at: input.soldAt,
  })

  if (error) throw error

  return data
}

export async function deleteEventSale(saleId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_event_sale', { p_id: saleId })

  if (error) throw error
}

export type CreateEventExpenseInput = {
  clientId: string
  eventId: string
  category: EventExpenseCategory
  description: string
  amount: number
  paymentMethod: PaymentMethod
  reference: string
  spentAt: string
  notes: string
}

export async function createEventExpense(input: CreateEventExpenseInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_event_expense', {
    p_client_id: input.clientId,
    p_event_id: input.eventId,
    p_category: input.category,
    p_description: input.description,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_reference: input.reference,
    p_spent_at: input.spentAt,
    p_notes: input.notes,
  })

  if (error) throw error

  return data
}

export async function deleteEventExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_event_expense', { p_id: expenseId })

  if (error) throw error
}

export type EventInventoryBundle = {
  stock: EventInventoryStock[]
  loads: EventInventoryLoadView[]
  movements: EventInventoryMovementView[]
}

export async function fetchEventInventory(eventId: string): Promise<EventInventoryBundle> {
  const [stockResult, loadsResult, movementsResult] = await Promise.all([
    supabase.from('v_event_inventory_stock').select('*').eq('event_id', eventId).order('item_name'),
    supabase
      .from('v_event_inventory_loads')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false }),
    supabase
      .from('v_event_inventory_movements')
      .select('*')
      .eq('event_id', eventId)
      .order('occurred_at', { ascending: false })
      .limit(100),
  ])

  if (stockResult.error) throw stockResult.error
  if (loadsResult.error) throw loadsResult.error
  if (movementsResult.error) throw movementsResult.error

  return {
    stock: stockResult.data,
    loads: loadsResult.data,
    movements: movementsResult.data,
  }
}

export type CreateEventInventoryLoadInput = {
  clientId: string
  eventId: string
  items: Array<{
    itemId: string
    qtyPurchase: number
    purchaseFactor: number
    totalCost: number
  }>
  category: EventExpenseCategory
  paymentMethod: PaymentMethod
  reference: string
  notes: string
}

export async function createEventInventoryLoad(
  input: CreateEventInventoryLoadInput,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_event_inventory_load', {
    p_client_id: input.clientId,
    p_event_id: input.eventId,
    p_items: input.items.map((item) => ({
      item_id: item.itemId,
      qty_purchase: item.qtyPurchase,
      purchase_factor: item.purchaseFactor,
      total_cost: item.totalCost,
    })),
    p_category: input.category,
    p_payment_method: input.paymentMethod,
    p_reference: input.reference,
    p_notes: input.notes,
  })

  if (error) throw error

  return data
}

export async function adjustEventInventoryItem(input: {
  eventId: string
  itemId: string
  countedQtyBase: number
  notes: string
}): Promise<number> {
  const { data, error } = await supabase.rpc('adjust_event_inventory_item', {
    p_event_id: input.eventId,
    p_item_id: input.itemId,
    p_counted_qty_base: input.countedQtyBase,
    p_notes: input.notes,
  })

  if (error) throw error

  return data
}

export async function transferEventInventoryToGeneral(input: {
  eventId: string
  itemId: string
  qtyBase: number
  notes: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('transfer_event_inventory_to_general', {
    p_event_id: input.eventId,
    p_item_id: input.itemId,
    p_qty_base: input.qtyBase,
    p_notes: input.notes,
  })

  if (error) throw error

  return data
}
