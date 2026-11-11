const USER_PREFIX = 'pisteale:user:'

export function userStorageKey(userId: string, name: string) {
  return `${USER_PREFIX}${userId}:${name}`
}

export function clearUserStorage(userId: string) {
  try {
    const prefix = `${USER_PREFIX}${userId}:`
    const keys: string[] = []

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)

      if (key?.startsWith(prefix)) {
        keys.push(key)
      }
    }

    for (const key of keys) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // El almacenamiento puede estar bloqueado; la sesión igual debe cerrarse.
  }
}
