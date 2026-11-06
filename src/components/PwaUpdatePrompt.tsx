import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-2xl border border-brand-400/40 bg-neutral-900 p-4 shadow-xl">
      <p className="text-sm font-medium text-neutral-100">Hay una nueva versión disponible.</p>
      <p className="mt-1 text-xs text-neutral-400">
        Si tienes una receta a medias, se guardará como borrador antes de actualizar.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="rounded-xl bg-brand-400 px-3 py-2 text-sm font-semibold text-neutral-950"
        >
          Actualizar
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300"
        >
          Después
        </button>
      </div>
    </div>
  )
}
