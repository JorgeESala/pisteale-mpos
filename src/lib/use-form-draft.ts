import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { FieldValues, UseFormWatch } from 'react-hook-form'
import { clearFormDraft, saveFormDraft } from './form-drafts'

type UseFormDraftOptions<T extends FieldValues> = {
  storageKey: string | null
  watch: UseFormWatch<T>
  enabled: boolean
  readyRef: RefObject<boolean>
}

export function useFormDraft<T extends FieldValues>({
  storageKey,
  watch,
  enabled,
  readyRef,
}: UseFormDraftOptions<T>) {
  const latestValues = useRef<T | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || !storageKey) return

    latestValues.current = null
    const key = storageKey

    const flush = () => {
      if (readyRef.current && latestValues.current) {
        saveFormDraft(key, latestValues.current)
      }
    }

    const schedule = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
      }
      timer.current = window.setTimeout(flush, 500)
    }

    const subscription = watch((values) => {
      if (!readyRef.current) return

      latestValues.current = values as T
      schedule()
    })

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    const handlePageHide = () => flush()

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
      }
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
      flush()
    }
  }, [enabled, readyRef, storageKey, watch])

  return useCallback(() => {
    if (storageKey) {
      clearFormDraft(storageKey)
    }
    latestValues.current = null
  }, [storageKey])
}
