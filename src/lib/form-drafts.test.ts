import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearFormDraft,
  formDraftKey,
  hasMeaningfulDraft,
  loadFormDraft,
  saveFormDraft,
} from './form-drafts'

describe('form drafts', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('saves and restores a draft', () => {
    const key = formDraftKey('recipe', 'user-1', 'product-1')
    saveFormDraft(key, { notes: 'Sin guardar' })

    expect(loadFormDraft<{ notes: string }>(key)).toEqual({ notes: 'Sin guardar' })
  })

  it('discards a draft after the expiration time', () => {
    const key = formDraftKey('recipe', 'user-1', 'product-1')
    window.localStorage.setItem(
      key,
      JSON.stringify({ version: 1, savedAt: Date.now() - 10_000, values: { notes: 'Viejo' } }),
    )

    expect(loadFormDraft<{ notes: string }>(key, 5_000)).toBeNull()
    expect(window.localStorage.getItem(key)).toBeNull()
  })

  it('clears a draft', () => {
    const key = formDraftKey('product', 'user-1', 'new')
    saveFormDraft(key, { name: 'Prueba' })
    clearFormDraft(key)

    expect(loadFormDraft(key)).toBeNull()
  })

  it('detects whether a draft differs from server values', () => {
    expect(hasMeaningfulDraft({ name: 'A' }, { name: 'A' })).toBe(false)
    expect(hasMeaningfulDraft({ name: 'A' }, { name: 'B' })).toBe(true)
  })
})
