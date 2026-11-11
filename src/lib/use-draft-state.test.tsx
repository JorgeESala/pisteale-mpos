import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { formDraftKey, loadFormDraft, saveFormDraft } from './form-drafts'
import { useDraftState } from './use-draft-state'

type Draft = {
  cart: string[]
  notes: string
}

const initialValue: Draft = { cart: [], notes: '' }

describe('useDraftState', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('restores an existing draft', () => {
    const key = formDraftKey('sale', 'user-1', 'nuevo')
    saveFormDraft(key, { cart: ['mojito'], notes: 'Mesa 2' })

    const { result } = renderHook(() => useDraftState({ storageKey: key, initialValue }))

    expect(result.current.value).toEqual({ cart: ['mojito'], notes: 'Mesa 2' })
    expect(result.current.restored).toBe(true)
  })

  it('saves every change immediately', () => {
    const key = formDraftKey('sale', 'user-1', 'nuevo')
    const { result } = renderHook(() => useDraftState({ storageKey: key, initialValue }))

    act(() => {
      result.current.setValue({ cart: ['paloma'], notes: 'Sin hielo' })
    })

    expect(loadFormDraft<Draft>(key)).toEqual({ cart: ['paloma'], notes: 'Sin hielo' })
  })

  it('flushes the latest value when the page is hidden', () => {
    const key = formDraftKey('sale', 'user-1', 'nuevo')
    const { result } = renderHook(() => useDraftState({ storageKey: key, initialValue }))

    act(() => {
      result.current.setValue({ cart: ['margarita'], notes: '' })
    })

    window.localStorage.removeItem(key)

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(loadFormDraft<Draft>(key)).toEqual({ cart: ['margarita'], notes: '' })
  })

  it('does not save a draft if the user has not changed anything', () => {
    const key = formDraftKey('sale', 'user-1', 'nuevo')
    const { unmount } = renderHook(() => useDraftState({ storageKey: key, initialValue }))

    unmount()

    expect(window.localStorage.getItem(key)).toBeNull()
  })

  it('does not save when there is no storage key', () => {
    const { result } = renderHook(() => useDraftState({ storageKey: null, initialValue }))

    act(() => {
      result.current.setValue({ cart: ['agua'], notes: '' })
    })

    expect(window.localStorage.length).toBe(0)
  })

  it('clears the stored draft', () => {
    const key = formDraftKey('sale', 'user-1', 'nuevo')
    saveFormDraft(key, { cart: ['mojito'], notes: '' })

    const { result } = renderHook(() => useDraftState({ storageKey: key, initialValue }))

    act(() => {
      result.current.discard()
    })

    expect(loadFormDraft(key)).toBeNull()
    expect(result.current.value).toEqual(initialValue)
    expect(result.current.restored).toBe(false)
  })
})
