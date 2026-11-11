import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { formatDate } from '@/features/inventory/inventory-utils'
import { formatCurrency } from '@/lib/format'
import { useOnlineStatus } from '@/lib/use-online-status'
import { eventStatusLabels } from './event-labels'
import { fetchEvents } from './queries'

export function EventsPage() {
  const online = useOnlineStatus()
  const eventsQuery = useQuery({
    queryKey: ['events'],
    queryFn: fetchEvents,
  })

  const events = eventsQuery.data ?? []

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">PISTEALE</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Eventos</h1>
        </div>
        <Link
          to="/eventos/nuevo"
          className="rounded-xl bg-brand-400 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-brand-300"
        >
          Nuevo evento
        </Link>
      </section>

      {!online ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Sin conexión. Se muestran los datos guardados en este teléfono.
        </p>
      ) : null}

      {eventsQuery.isLoading ? (
        <p className="text-sm text-neutral-500">Cargando eventos…</p>
      ) : eventsQuery.isError && events.length === 0 ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {eventsQuery.error.message}
        </p>
      ) : events.length === 0 ? (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-semibold">Todavía no hay eventos</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Crea el evento para registrar ventas, gastos y saber cuánto se ganó o perdió.
          </p>
          <Link
            to="/eventos/nuevo"
            className="mt-4 inline-flex rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200"
          >
            Crear evento
          </Link>
        </section>
      ) : (
        <section className="space-y-3">
          {events.map((event) => (
            <Link
              key={event.id}
              to={`/eventos/${event.id}`}
              className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium tracking-wide text-neutral-500">
                    {event.folio}
                  </p>
                  <h2 className="mt-0.5 truncate font-semibold">{event.name}</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    {formatDate(event.event_date)}
                    {event.venue ? ` · ${event.venue}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${
                    event.status === 'open'
                      ? 'bg-green-500/15 text-green-300'
                      : 'bg-neutral-700/50 text-neutral-300'
                  }`}
                >
                  {eventStatusLabels[event.status]}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-[11px] text-neutral-500">Ventas</p>
                  <p className="mt-0.5 font-medium text-neutral-200">
                    {formatCurrency(event.sales_total)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-500">Gastos</p>
                  <p className="mt-0.5 font-medium text-neutral-200">
                    {formatCurrency(event.expenses_total)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-500">Utilidad</p>
                  <p
                    className={`mt-0.5 font-semibold ${
                      event.profit >= 0 ? 'text-green-300' : 'text-red-300'
                    }`}
                  >
                    {formatCurrency(event.profit)}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-neutral-500">
                {event.sales_count} {event.sales_count === 1 ? 'venta' : 'ventas'} ·{' '}
                {event.drinks_count} {event.drinks_count === 1 ? 'bebida' : 'bebidas'} ·{' '}
                {event.expenses_count} {event.expenses_count === 1 ? 'gasto' : 'gastos'}
                {event.margin_percent !== null ? ` · Margen ${event.margin_percent}%` : ''}
              </p>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}
