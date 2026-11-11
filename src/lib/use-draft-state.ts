import { useCallback, useEffect, useRef, useState } from 'react'
import { clearFormDraft, hasMeaningfulDraft, loadFormDraft, saveFormDraft } from './form-drafts'

type UseDraftStateOptions<T> = {
  storageKey: string | null
  initialValue: T
}

type DraftState<T> = {
  value: T
  restored: boolean
}

function loadDraftState<T>(storageKey: string | null, initialValue: T): DraftState<T> {
  if (!storageKey) {
    return { value: initialValue, restored: false }
  }

  const draft = loadFormDraft<T>(storageKey)

  if (draft !== null && hasMeaningfulDraft(draft, initialValue)) {
    return { value: draft, restored: true }
  }

  if (draft !== null) {
    clearFormDraft(storageKey)
  }

  return { value: initialValue, restored: false }
}

export function useDraftState<T>({ storageKey, initialValue }: UseDraftStateOptions<T>) {
  const [state, setState] = useState<DraftState<T>>(() => loadDraftState(storageKey, initialValue))
  const loadedKeyRef = useRef(storageKey)
  const valueRef = useRef(state.value)
  const dirtyRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (loadedKeyRef.current === storageKey) return

    loadedKeyRef.current = storageKey
    dirtyRef.current = false

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const next = loadDraftState(storageKey, initialValue)
    valueRef.current = next.value
    queueMicrotask(() => setState(next))
  }, [initialValue, storageKey])

  useEffect(() => {
    if (!storageKey) return

    const flush = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }

      if (dirtyRef.current) {
        saveFormDraft(storageKey, valueRef.current)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    window.addEventListener('freeze', flush)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('freeze', flush)
      flush()
    }
  }, [storageKey])

  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      const resolved =
        typeof next === 'function' ? (next as (current: T) => T)(valueRef.current) : next

      valueRef.current = resolved
      dirtyRef.current = true
      setState((current) => ({ value: resolved, restored: current.restored }))

      if (storageKey) {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current)
        }

        timerRef.current = window.setTimeout(() => {
          if (dirtyRef.current) {
            saveFormDraft(storageKey, valueRef.current)
          }
          timerRef.current = null
        }, 250)
      }
    },
    [storageKey],
  )

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (storageKey) {
      clearFormDraft(storageKey)
    }
    dirtyRef.current = false
    setState((current) => ({ ...current, restored: false }))
  }, [storageKey])

  const discard = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (storageKey) {
      clearFormDraft(storageKey)
    }
    dirtyRef.current = false
    valueRef.current = initialValue
    setState({ value: initialValue, restored: false })
  }, [initialValue, storageKey])

  return {
    value: state.value,
    setValue,
    restored: state.restored,
    clear,
    discard,
  }
}
