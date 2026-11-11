import type { EventExpenseCategory, PaymentMethod } from '@/types/database'
import type { EventSaleLineInput } from './event-pricing'

const SALES_KEY = 'pisteale:event-sales-queue:v1'
const EXPENSES_KEY = 'pisteale:event-expenses-queue:v1'

export type PendingEventSale = {
  clientId: string
  eventId: string
  soldAt: string
  items: EventSaleLineInput[]
  applyPromotion: boolean
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

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function loadQueue<T>(key: string, isValid: (value: unknown) => value is T): T[] {
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

function saveQueue<T>(key: string, items: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(items))
  } catch {
    // Si el almacenamiento está lleno, la venta ya se mostró en pantalla.
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

export function loadPendingEventSales() {
  return loadQueue(SALES_KEY, isPendingEventSale)
}

export function loadPendingEventExpenses() {
  return loadQueue(EXPENSES_KEY, isPendingEventExpense)
}

export function enqueueEventSale(input: EventSaleQueueInput) {
  const sales = loadPendingEventSales()
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

  saveQueue(SALES_KEY, [...sales, pending])
  return pending
}

export function enqueueEventExpense(input: EventExpenseQueueInput) {
  const expenses = loadPendingEventExpenses()
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

  saveQueue(EXPENSES_KEY, [...expenses, pending])
  return pending
}

export function removePendingEventSale(clientId: string) {
  saveQueue(
    SALES_KEY,
    loadPendingEventSales().filter((sale) => sale.clientId !== clientId),
  )
}

export function removePendingEventExpense(clientId: string) {
  saveQueue(
    EXPENSES_KEY,
    loadPendingEventExpenses().filter((expense) => expense.clientId !== clientId),
  )
}

export function markPendingEventSaleError(clientId: string, error: string) {
  saveQueue(
    SALES_KEY,
    loadPendingEventSales().map((sale) =>
      sale.clientId === clientId ? { ...sale, status: 'error', error } : sale,
    ),
  )
}

export function markPendingEventExpenseError(clientId: string, error: string) {
  saveQueue(
    EXPENSES_KEY,
    loadPendingEventExpenses().map((expense) =>
      expense.clientId === clientId ? { ...expense, status: 'error', error } : expense,
    ),
  )
}

export function pendingSalesForEvent(eventId: string) {
  return loadPendingEventSales().filter((sale) => sale.eventId === eventId)
}

export function pendingExpensesForEvent(eventId: string) {
  return loadPendingEventExpenses().filter((expense) => expense.eventId === eventId)
}
