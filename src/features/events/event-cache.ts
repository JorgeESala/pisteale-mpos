import type {
  EventExpenseView,
  EventProduct,
  EventSaleItemView,
  EventSaleView,
  EventView,
} from '@/types/database'
import { userStorageKey } from '@/lib/user-storage'

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

function listKey(userId: string) {
  return userStorageKey(userId, 'event-list-cache:v2')
}

function productsKey(userId: string) {
  return userStorageKey(userId, 'event-products-cache:v2')
}

function detailKey(userId: string, eventId: string) {
  return userStorageKey(userId, `event-detail-cache:v2:${eventId}`)
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
    return true
  } catch {
    return false
  }
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function loadEventListCache(userId: string) {
  return readCache<EventView[]>(listKey(userId))
}

export function saveEventListCache(userId: string, events: EventView[]) {
  return writeCache(listKey(userId), events)
}

export function loadEventProductsCache(userId: string) {
  return readCache<EventProduct[]>(productsKey(userId))
}

export function saveEventProductsCache(userId: string, products: EventProduct[]) {
  return writeCache(productsKey(userId), products)
}

export function loadEventDetailCache(userId: string, eventId: string) {
  return readCache<EventBundle>(detailKey(userId, eventId))
}

export function saveEventDetailCache(userId: string, bundle: EventBundle) {
  return writeCache(detailKey(userId, bundle.event.id), bundle)
}

export function clearEventDetailCache(userId: string, eventId: string) {
  try {
    window.localStorage.removeItem(detailKey(userId, eventId))
  } catch {
    // Nada que hacer.
  }
}

export function hasEventOfflineData(userId: string, eventId: string) {
  return loadEventDetailCache(userId, eventId) !== null && loadEventProductsCache(userId) !== null
}
