import type { EventExpenseCategory, PaymentMethod } from '@/types/database'
import { userStorageKey } from '@/lib/user-storage'
import type { EventSaleLineInput } from './event-pricing'

const SALES_NAME = 'event-sales-queue:v2'
const EXPENSES_NAME = 'event-expenses-queue:v2'

export class OfflineStorageError extends Error {
  constructor(message = 'No se pudo guardar la venta en el teléfono.') {
    super(message)
    this.name = 'OfflineStorageError'
  }
}

export type PendingEventSale = {
  clientId: string
  eventId: string
  soldAt: string
  items: EventSaleLineInput[]
  applyPromotion: boolean
  bundleQty: number
  bundlePrice: number
  paymentMethod: PaymentMethod
  notes: string
  queuedAt: number
  status: 'pending' | 'error'
  error: string | null
}

export type PendingEventExpense = {
  clientId: string
  eventId: string
  category: EventExpenseCategory
  description: string
  amount: number
  paymentMethod: PaymentMethod
  reference: string
  spentAt: string
  notes: string
  queuedAt: number
  status: 'pending' | 'error'
  error: string | null
}

export type EventSaleQueueInput = Omit<
  PendingEventSale,
  'clientId' | 'queuedAt' | 'status' | 'error'
> & {
  clientId?: string
}

export type EventExpenseQueueInput = Omit<
  PendingEventExpense,
  'clientId' | 'queuedAt' | 'status' | 'error'
> & {
  clientId?: string
}

export function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
      16,
      20,
    )}-${hex.slice(20)}`
  }

  throw new Error('El navegador no puede generar identificadores seguros.')
}

function loadQueue<T>(userId: string, name: string, isValid: (value: unknown) => value is T): T[] {
  const key = userStorageKey(userId, name)

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(key)
      return []
    }

    return parsed.filter(isValid)
  } catch {
    window.localStorage.removeItem(key)
    return []
  }
}

function saveQueue<T>(userId: string, name: string, items: T[]) {
  try {
    window.localStorage.setItem(userStorageKey(userId, name), JSON.stringify(items))
    return true
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === 'cash' || value === 'card' || value === 'transfer' || value === 'other'
}

function isPendingEventSale(value: unknown): value is PendingEventSale {
  if (!isRecord(value)) return false
  if (typeof value.clientId !== 'string' || typeof value.eventId !== 'string') return false
  if (typeof value.soldAt !== 'string' || typeof value.notes !== 'string') return false
  if (!isPaymentMethod(value.paymentMethod)) return false
  if (typeof value.applyPromotion !== 'boolean') return false
  if (typeof value.bundleQty !== 'number' || typeof value.bundlePrice !== 'number') return false
  if (!Array.isArray(value.items) || value.items.length === 0) return false
  if (value.status !== 'pending' && value.status !== 'error') return false

  return value.items.every(
    (item) =>
      isRecord(item) &&
      (typeof item.productId === 'string' || item.productId === null) &&
      typeof item.productName === 'string' &&
      typeof item.quantity === 'number' &&
      typeof item.unitPrice === 'number' &&
      typeof item.promotionEligible === 'boolean',
  )
}

function isEventExpenseCategory(value: unknown): value is EventExpenseCategory {
  return (
    value === 'supplies' ||
    value === 'ice' ||
    value === 'transport' ||
    value === 'staff' ||
    value === 'permits' ||
    value === 'rent' ||
    value === 'other'
  )
}

function isPendingEventExpense(value: unknown): value is PendingEventExpense {
  if (!isRecord(value)) return false

  return (
    typeof value.clientId === 'string' &&
    typeof value.eventId === 'string' &&
    isEventExpenseCategory(value.category) &&
    typeof value.description === 'string' &&
    typeof value.amount === 'number' &&
    isPaymentMethod(value.paymentMethod) &&
    typeof value.reference === 'string' &&
    typeof value.spentAt === 'string' &&
    typeof value.notes === 'string' &&
    (value.status === 'pending' || value.status === 'error')
  )
}

export function loadPendingEventSales(userId: string) {
  return loadQueue(userId, SALES_NAME, isPendingEventSale)
}

export function loadPendingEventExpenses(userId: string) {
  return loadQueue(userId, EXPENSES_NAME, isPendingEventExpense)
}

export function enqueueEventSale(userId: string, input: EventSaleQueueInput) {
  const sales = loadPendingEventSales(userId)
  const clientId = input.clientId ?? createClientId()
  const existing = sales.find((sale) => sale.clientId === clientId)

  if (existing) return existing

  const pending: PendingEventSale = {
    ...input,
    clientId,
    queuedAt: Date.now(),
    status: 'pending',
    error: null,
  }

  if (!saveQueue(userId, SALES_NAME, [...sales, pending])) {
    throw new OfflineStorageError(
      'No se pudo guardar la venta en el teléfono. Libera espacio e inténtalo de nuevo.',
    )
  }

  return pending
}

export function enqueueEventExpense(userId: string, input: EventExpenseQueueInput) {
  const expenses = loadPendingEventExpenses(userId)
  const clientId = input.clientId ?? createClientId()
  const existing = expenses.find((expense) => expense.clientId === clientId)

  if (existing) return existing

  const pending: PendingEventExpense = {
    ...input,
    clientId,
    queuedAt: Date.now(),
    status: 'pending',
    error: null,
  }

  if (!saveQueue(userId, EXPENSES_NAME, [...expenses, pending])) {
    throw new OfflineStorageError(
      'No se pudo guardar el gasto en el teléfono. Libera espacio e inténtalo de nuevo.',
    )
  }

  return pending
}

export function removePendingEventSale(userId: string, clientId: string) {
  return saveQueue(
    userId,
    SALES_NAME,
    loadPendingEventSales(userId).filter((sale) => sale.clientId !== clientId),
  )
}

export function removePendingEventExpense(userId: string, clientId: string) {
  return saveQueue(
    userId,
    EXPENSES_NAME,
    loadPendingEventExpenses(userId).filter((expense) => expense.clientId !== clientId),
  )
}

export function markPendingEventSaleError(userId: string, clientId: string, error: string) {
  return saveQueue(
    userId,
    SALES_NAME,
    loadPendingEventSales(userId).map((sale) =>
      sale.clientId === clientId ? { ...sale, status: 'error', error } : sale,
    ),
  )
}

export function markPendingEventExpenseError(userId: string, clientId: string, error: string) {
  return saveQueue(
    userId,
    EXPENSES_NAME,
    loadPendingEventExpenses(userId).map((expense) =>
      expense.clientId === clientId ? { ...expense, status: 'error', error } : expense,
    ),
  )
}

export function retryPendingEventSale(userId: string, clientId: string) {
  return saveQueue(
    userId,
    SALES_NAME,
    loadPendingEventSales(userId).map((sale) =>
      sale.clientId === clientId ? { ...sale, status: 'pending', error: null } : sale,
    ),
  )
}

export function retryPendingEventExpense(userId: string, clientId: string) {
  return saveQueue(
    userId,
    EXPENSES_NAME,
    loadPendingEventExpenses(userId).map((expense) =>
      expense.clientId === clientId ? { ...expense, status: 'pending', error: null } : expense,
    ),
  )
}

// La cola vive en localStorage y no está diseñada para dos pestañas concurrentes.
export function pendingSalesForEvent(userId: string, eventId: string) {
  return loadPendingEventSales(userId).filter((sale) => sale.eventId === eventId)
}

export function pendingExpensesForEvent(userId: string, eventId: string) {
  return loadPendingEventExpenses(userId).filter((expense) => expense.eventId === eventId)
}
