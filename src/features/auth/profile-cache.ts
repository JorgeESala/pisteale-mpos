import type { Profile } from '@/types/database'
import { userStorageKey } from '@/lib/user-storage'

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type ProfileCacheEnvelope = {
  version: 1
  savedAt: number
  value: Profile
}

function profileKey(userId: string) {
  return userStorageKey(userId, 'profile-cache:v1')
}

export function loadCachedProfile(userId: string): Profile | null {
  try {
    const raw = window.localStorage.getItem(profileKey(userId))
    if (!raw) return null

    const parsed = JSON.parse(raw) as ProfileCacheEnvelope
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > MAX_AGE_MS ||
      !parsed.value ||
      parsed.value.id !== userId ||
      typeof parsed.value.role !== 'string'
    ) {
      window.localStorage.removeItem(profileKey(userId))
      return null
    }

    return parsed.value
  } catch {
    window.localStorage.removeItem(profileKey(userId))
    return null
  }
}

export function saveCachedProfile(profile: Profile) {
  try {
    const envelope: ProfileCacheEnvelope = {
      version: 1,
      savedAt: Date.now(),
      value: profile,
    }
    window.localStorage.setItem(profileKey(profile.id), JSON.stringify(envelope))
  } catch {
    // El caché es una ayuda; no interrumpimos la sesión.
  }
}

export function clearCachedProfile(userId: string) {
  try {
    window.localStorage.removeItem(profileKey(userId))
  } catch {
    // Nada que hacer.
  }
}
