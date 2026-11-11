import type {
  EventExpenseView,
  EventProduct,
  EventSaleItemView,
  EventSaleView,
  EventView,
} from '@/types/database'

const LIST_KEY = 'pisteale:event-list-cache:v1'
const PRODUCTS_KEY = 'pisteale:event-products-cache:v1'
const DETAIL_PREFIX = 'pisteale:event-detail-cache:v1:'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type CacheEnvelope<T> = {
  version: 1
  savedAt: number
  value: T
}

export type EventBundle = {
  event: EventView
  sales: EventSaleView[]
  saleItems: EventSaleItemView[]
  expenses: EventExpenseView[]
}

function readCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as CacheEnvelope<T>
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > MAX_AGE_MS ||
      parsed.value === undefined
    ) {
      window.localStorage.removeItem(key)
      return null
    }

    return parsed.value
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}

function writeCache<T>(key: string, value: T) {
  try {
    const envelope: CacheEnvelope<T> = {
      version: 1,
      savedAt: Date.now(),
      value,
    }
    window.localStorage.setItem(key, JSON.stringify(envelope))
  } catch {
    // El caché es una ayuda; si falla, la app sigue funcionando en línea.
  }
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function loadEventListCache() {
  return readCache<EventView[]>(LIST_KEY)
}

export function saveEventListCache(events: EventView[]) {
  writeCache(LIST_KEY, events)
}

export function loadEventProductsCache() {
  return readCache<EventProduct[]>(PRODUCTS_KEY)
}

export function saveEventProductsCache(products: EventProduct[]) {
  writeCache(PRODUCTS_KEY, products)
}

export function loadEventDetailCache(eventId: string) {
  return readCache<EventBundle>(`${DETAIL_PREFIX}${eventId}`)
}

export function saveEventDetailCache(bundle: EventBundle) {
  writeCache(`${DETAIL_PREFIX}${bundle.event.id}`, bundle)
}

export function clearEventDetailCache(eventId: string) {
  window.localStorage.removeItem(`${DETAIL_PREFIX}${eventId}`)
}
