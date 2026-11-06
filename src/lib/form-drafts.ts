export type FormDraft<T> = {
  version: 1
  savedAt: number
  values: T
}

const DRAFT_PREFIX = 'pisteale:form-draft:'
export const FORM_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function formDraftKey(scope: string, userId: string, entityId: string) {
  return `${DRAFT_PREFIX}${scope}:${userId}:${entityId}`
}

export function loadFormDraft<T>(key: string, maxAgeMs = FORM_DRAFT_MAX_AGE_MS): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as FormDraft<T>
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > maxAgeMs ||
      !parsed.values ||
      typeof parsed.values !== 'object'
    ) {
      window.localStorage.removeItem(key)
      return null
    }

    return parsed.values
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}

export function saveFormDraft<T>(key: string, values: T) {
  try {
    const draft: FormDraft<T> = {
      version: 1,
      savedAt: Date.now(),
      values,
    }
    window.localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Si el almacenamiento está lleno o bloqueado, no interrumpimos la edición.
  }
}

export function clearFormDraft(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nada que hacer.
  }
}

export function hasMeaningfulDraft<T>(draft: T, serverValues: T) {
  return JSON.stringify(draft) !== JSON.stringify(serverValues)
}
