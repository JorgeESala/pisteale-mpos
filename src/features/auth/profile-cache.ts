import type { Profile } from '@/types/database'
import { userStorageKey } from '@/lib/user-storage'

function profileKey(userId: string) {
  return userStorageKey(userId, 'profile-cache:v1')
}

export function loadCachedProfile(userId: string): Profile | null {
  try {
    const raw = window.localStorage.getItem(profileKey(userId))
    if (!raw) return null

    const parsed = JSON.parse(raw) as Profile
    if (!parsed || parsed.id !== userId || typeof parsed.role !== 'string') {
      window.localStorage.removeItem(profileKey(userId))
      return null
    }

    return parsed
  } catch {
    window.localStorage.removeItem(profileKey(userId))
    return null
  }
}

export function saveCachedProfile(profile: Profile) {
  try {
    window.localStorage.setItem(profileKey(profile.id), JSON.stringify(profile))
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
