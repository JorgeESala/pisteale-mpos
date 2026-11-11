import { isOffline } from './event-cache'

export function isConnectivityError(error: unknown) {
  if (isOffline()) return true

  if (typeof error === 'object' && error !== null && 'code' in error) {
    return false
  }

  const message = error instanceof Error ? error.message : String(error)
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|aborted/i.test(
    message,
  )
}
