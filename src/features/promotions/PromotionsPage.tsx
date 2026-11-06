import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatCurrency } from '@/lib/format'
import { fetchPromotions } from '@/features/sales/queries'

export function PromotionsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const promotionsQuery = useQuery({
    queryKey: ['promotions'],
    queryFn: fetchPromotions,
    enabled: isAdmin,
  })

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
        <h1 className="font-semibold">Acceso restringido</h1>
        <p className="mt-1 text-sm">Solo administradores pueden configurar promociones.</p>
        <Link to="/" className="mt-4 inline-flex text-sm text-amber-100 underline">
          Volver al inicio
        </Link>
      </section>
    )
  }

  if (promotionsQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando promociones…</p>
  }

  if (promotionsQuery.isError) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {promotionsQuery.error.message}
      </p>
    )
  }

  const promotions = promotionsQuery.data ?? []

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Administración</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Promociones</h1>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            to="/promociones/nuevo"
            className="rounded-xl bg-brand-400 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-brand-300"
          >
            Nueva
          </Link>
          <Link
            to="/"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Volver
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
        Las promociones automáticas se aplican sin que el cajero las seleccione. Las manuales
        aparecen en Pedidos para que el cajero decida cuándo usarlas.
      </section>

      <div className="space-y-3">
        <p className="text-xs text-neutral-500">
          {promotions.length} {promotions.length === 1 ? 'promoción' : 'promociones'}
        </p>

        {promotions.map((promotion) => (
          <Link
            key={promotion.id}
            to={`/promociones/${promotion.id}`}
            className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-600"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{promotion.name}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {promotion.bundle_qty} × {formatCurrency(promotion.fixed_price)} ·{' '}
                  {promotion.line_targeted
                    ? 'Precio por línea'
                    : promotion.automatic
                      ? 'Automática'
                      : 'Manual'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${
                  promotion.active
                    ? 'bg-green-500/15 text-green-300'
                    : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                {promotion.active ? 'Activa' : 'Inactiva'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-400">
              <span className="rounded-full bg-neutral-800 px-2 py-1">
                {promotion.applies_to === 'alcoholic'
                  ? 'Con alcohol'
                  : promotion.applies_to === 'non_alcoholic'
                    ? 'Sin alcohol'
                    : 'Cualquier bebida'}
              </span>
              <span className="rounded-full bg-neutral-800 px-2 py-1">
                {promotion.applies_to_tier === 'any'
                  ? 'Cualquier tier'
                  : promotion.applies_to_tier === 'premium'
                    ? 'Premium'
                    : 'Normal'}
              </span>
            </div>
          </Link>
        ))}

        {promotions.length === 0 ? (
          <p className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
            Aún no hay promociones.
          </p>
        ) : null}
      </div>
    </div>
  )
}
