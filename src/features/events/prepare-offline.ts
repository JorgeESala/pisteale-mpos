import { hasEventOfflineData } from './event-cache'

type RefetchResult = {
  isError: boolean
  error: unknown
  data: unknown
}

type PrepareEventOfflineOptions = {
  userId: string
  eventId: string
  refetchBundle: () => Promise<RefetchResult>
  refetchProducts: () => Promise<RefetchResult>
  fetchEvents: () => Promise<unknown>
  persist?: () => Promise<boolean>
}

export type PrepareEventOfflineResult = { ok: true } | { ok: false; message: string }

export async function prepareEventOffline({
  userId,
  eventId,
  refetchBundle,
  refetchProducts,
  fetchEvents,
  persist,
}: PrepareEventOfflineOptions): Promise<PrepareEventOfflineResult> {
  try {
    const [bundleResult, productsResult] = await Promise.all([refetchBundle(), refetchProducts()])

    if (bundleResult.isError) throw bundleResult.error
    if (productsResult.isError) throw productsResult.error

    if (!bundleResult.data || !hasEventOfflineData(userId, eventId)) {
      throw new Error('No se pudo guardar el evento y el catálogo en el teléfono.')
    }

    // La lista es útil para navegar offline, pero no debe invalidar la preparación.
    await fetchEvents().catch(() => undefined)

    if (persist) {
      await persist().catch(() => false)
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se pudo preparar el modo offline.',
    }
  }
}
