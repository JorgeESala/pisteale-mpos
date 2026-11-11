import { useOnlineStatus } from '@/lib/use-online-status'
import { useEventSync } from './event-sync-context'

export function EventSyncBanner() {
  const online = useOnlineStatus()
  const { pendingCount, errorCount, queuedCount, syncing, syncError, syncNow, retryErrors } =
    useEventSync()

  if (queuedCount === 0 && !syncError) return null

  return (
    <section className="mb-4 space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {queuedCount} {queuedCount === 1 ? 'registro pendiente' : 'registros pendientes'}
          </p>
          <p className="mt-0.5 text-xs text-amber-200">
            {pendingCount} por sincronizar
            {errorCount > 0 ? ` · ${errorCount} con error` : ''}
            {!online ? ' · Sin conexión' : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {pendingCount > 0 ? (
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={!online || syncing}
              className="rounded-lg border border-amber-400/40 px-2 py-1 text-xs disabled:opacity-60"
            >
              {syncing ? 'Sincronizando…' : 'Sincronizar'}
            </button>
          ) : null}
          {errorCount > 0 ? (
            <button
              type="button"
              onClick={() => void retryErrors()}
              disabled={!online || syncing}
              className="rounded-lg border border-amber-400/40 px-2 py-1 text-xs disabled:opacity-60"
            >
              Reintentar errores
            </button>
          ) : null}
        </div>
      </div>
      {syncError ? <p className="text-xs text-red-200">{syncError}</p> : null}
    </section>
  )
}
