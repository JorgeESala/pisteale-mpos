import { FORM_DRAFT_PREFIX } from './form-drafts'

const USER_PREFIX = 'pisteale:user:'

const PRESERVED_ON_CACHE_CLEAR = ['event-sales-queue:', 'event-expenses-queue:']

export function userStorageKey(userId: string, name: string) {
  return `${USER_PREFIX}${userId}:${name}`
}

function userKeys(userId: string) {
  const prefix = `${USER_PREFIX}${userId}:`
  const keys: string[] = []

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)

    if (key?.startsWith(prefix)) {
      keys.push(key)
    }
  }

  return { prefix, keys }
}

export function clearUserStorage(userId: string) {
  try {
    const { keys } = userKeys(userId)

    for (const key of keys) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // El almacenamiento puede estar bloqueado; la sesión igual debe cerrarse.
  }
}

// Al cerrar sesión se conservan las colas offline para no perder ventas pendientes.
// Las claves están namespaced por usuario, así que otra cuenta no puede verlas.
export function clearUserCaches(userId: string) {
  try {
    const { prefix, keys } = userKeys(userId)
    const draftMarker = `:${userId}:`

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)

      if (key?.startsWith(FORM_DRAFT_PREFIX) && key.includes(draftMarker) && !keys.includes(key)) {
        keys.push(key)
      }
    }

    for (const key of keys) {
      const name = key.startsWith(prefix) ? key.slice(prefix.length) : ''

      if (
        key.startsWith(FORM_DRAFT_PREFIX) ||
        !PRESERVED_ON_CACHE_CLEAR.some((preserved) => name.startsWith(preserved))
      ) {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    // El almacenamiento puede estar bloqueado; la sesión igual debe cerrarse.
  }
}
