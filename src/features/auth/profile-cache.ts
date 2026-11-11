import type { Profile } from '@/types/database'

const PREFIX = 'pisteale:profile-cache:v1:'

export function loadCachedProfile(userId: string): Profile | null {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${userId}`)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Profile
    if (!parsed || parsed.id !== userId || typeof parsed.role !== 'string') {
      window.localStorage.removeItem(`${PREFIX}${userId}`)
      return null
    }

    return parsed
  } catch {
    window.localStorage.removeItem(`${PREFIX}${userId}`)
    return null
  }
}

export function saveCachedProfile(profile: Profile) {
  try {
    window.localStorage.setItem(`${PREFIX}${profile.id}`, JSON.stringify(profile))
  } catch {
    // El caché es una ayuda; no interrumpimos la sesión.
  }
}

export function clearCachedProfile(userId: string) {
  try {
    window.localStorage.removeItem(`${PREFIX}${userId}`)
  } catch {
    // Nada que hacer.
  }
}
