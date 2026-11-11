import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { clearFormDraft, formDraftKey, hasMeaningfulDraft, loadFormDraft } from '@/lib/form-drafts'
import { useFormDraft } from '@/lib/use-form-draft'
import { clearEventDetailCache } from './event-cache'
import { eventFormSchema, type EventForm } from './event-schemas'
import { createEvent, fetchEvents, updateEvent } from './queries'

function todayValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

const emptyEventForm: EventForm = {
  name: '',
  venue: '',
  eventDate: todayValue(),
  startTime: '17:00',
  endTime: '22:00',
  promotionEnabled: true,
  bundleQty: 2,
  bundlePrice: 180,
  openingCash: 0,
  notes: '',
}

export function EventFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const isNew = !id
  const canManageEvents = profile?.role === 'admin' || profile?.role === 'operador'

  const eventsQuery = useQuery({
    queryKey: ['events'],
    queryFn: fetchEvents,
    enabled: canManageEvents,
  })

  const event = isNew ? null : eventsQuery.data?.find((candidate) => candidate.id === id)

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EventForm>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: emptyEventForm,
  })

  const promotionEnabled = useWatch({ control, name: 'promotionEnabled' })
  const storageKey = profile?.id ? formDraftKey('event', profile.id, id ?? 'nuevo') : null
  const initializedKeyRef = useRef<string | null>(null)
  const readyRef = useRef(false)
  const [draftRestored, setDraftRestored] = useState(false)

  useEffect(() => {
    readyRef.current = false
    if (!canManageEvents || !storageKey) return
    if (!isNew && !eventsQuery.isSuccess) return
    if (initializedKeyRef.current === storageKey) {
      readyRef.current = true
      return
    }

    initializedKeyRef.current = storageKey
    const serverValues: EventForm = event
      ? {
          name: event.name,
          venue: event.venue,
          eventDate: event.event_date,
          startTime: event.start_time?.slice(0, 5) ?? '',
          endTime: event.end_time?.slice(0, 5) ?? '',
          promotionEnabled: event.promotion_enabled,
          bundleQty: event.bundle_qty,
          bundlePrice: event.bundle_price,
          openingCash: event.opening_cash,
          notes: event.notes,
        }
      : emptyEventForm
    const draft = loadFormDraft<Partial<EventForm>>(storageKey)
    const candidate = draft ? { ...serverValues, ...draft } : serverValues
    const restored = Boolean(draft && hasMeaningfulDraft(candidate, serverValues))

    if (restored) {
      reset(candidate as EventForm)
    } else {
      if (draft) clearFormDraft(storageKey)
      reset(serverValues)
    }

    readyRef.current = true
    queueMicrotask(() => setDraftRestored(restored))
  }, [canManageEvents, event, eventsQuery.isSuccess, isNew, reset, storageKey])

  const clearDraft = useFormDraft<EventForm>({
    storageKey,
    watch,
    readyRef,
    enabled: canManageEvents && Boolean(storageKey),
  })

  const saveMutation = useMutation({
    mutationFn: (values: EventForm) => {
      const input = {
        name: values.name,
        venue: values.venue,
        eventDate: values.eventDate,
        startTime: values.startTime || null,
        endTime: values.endTime || null,
        promotionEnabled: values.promotionEnabled,
        bundleQty: values.bundleQty,
        bundlePrice: values.bundlePrice,
        openingCash: values.openingCash,
        notes: values.notes,
      }

      return isNew ? createEvent(input) : updateEvent({ id: id!, ...input })
    },
    onSuccess: (eventId) => {
      clearDraft()
      setDraftRestored(false)
      clearEventDetailCache(eventId)
      void queryClient.invalidateQueries({ queryKey: ['events'] })
      void queryClient.invalidateQueries({ queryKey: ['event_bundle', eventId] })
      navigate(`/eventos/${eventId}`)
    },
  })

  async function onSubmit(values: EventForm) {
    await saveMutation.mutateAsync(values)
  }

  function discardDraft() {
    clearDraft()
    reset(
      event
        ? {
            name: event.name,
            venue: event.venue,
            eventDate: event.event_date,
            startTime: event.start_time?.slice(0, 5) ?? '',
            endTime: event.end_time?.slice(0, 5) ?? '',
            promotionEnabled: event.promotion_enabled,
            bundleQty: event.bundle_qty,
            bundlePrice: event.bundle_price,
            openingCash: event.opening_cash,
            notes: event.notes,
          }
        : emptyEventForm,
    )
    setDraftRestored(false)
  }

  if (!canManageEvents) {
    return (
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
        <h1 className="font-semibold">Acceso restringido</h1>
        <p className="mt-1 text-sm">Solo administradores y operadores pueden crear eventos.</p>
        <Link to="/eventos" className="mt-4 inline-flex text-sm text-amber-100 underline">
          Volver a eventos
        </Link>
      </section>
    )
  }

  if (!isNew && eventsQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando evento…</p>
  }

  if (!isNew && !event) {
    return (
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h1 className="font-semibold">Evento no encontrado</h1>
        <Link to="/eventos" className="mt-4 inline-flex text-sm text-neutral-300 underline">
          Volver a eventos
        </Link>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <section>
        <p className="text-sm text-neutral-400">Eventos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {isNew ? 'Nuevo evento' : 'Editar evento'}
        </h1>
      </section>

      {draftRestored ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-400/40 bg-brand-400/10 p-3 text-sm">
          <p className="text-brand-100">Borrador restaurado. Puedes continuar donde lo dejaste.</p>
          <button
            type="button"
            onClick={discardDraft}
            className="shrink-0 rounded-lg border border-brand-400/40 px-2 py-1 text-xs text-brand-200"
          >
            Descartar
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <div>
            <label htmlFor="eventName" className="mb-1.5 block text-sm text-neutral-300">
              Nombre
            </label>
            <input
              id="eventName"
              type="text"
              placeholder="Evento en el parque"
              {...register('name')}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            />
            {errors.name ? (
              <p className="mt-1 text-xs text-red-300">{errors.name.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="eventVenue" className="mb-1.5 block text-sm text-neutral-300">
              Sede
            </label>
            <input
              id="eventVenue"
              type="text"
              placeholder="Parque central"
              {...register('venue')}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            />
            {errors.venue ? (
              <p className="mt-1 text-xs text-red-300">{errors.venue.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="eventDate" className="mb-1.5 block text-sm text-neutral-300">
              Fecha
            </label>
            <input
              id="eventDate"
              type="date"
              {...register('eventDate')}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            />
            {errors.eventDate ? (
              <p className="mt-1 text-xs text-red-300">{errors.eventDate.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="eventStart" className="mb-1.5 block text-sm text-neutral-300">
                Inicio
              </label>
              <input
                id="eventStart"
                type="time"
                {...register('startTime')}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              />
            </div>
            <div>
              <label htmlFor="eventEnd" className="mb-1.5 block text-sm text-neutral-300">
                Fin
              </label>
              <input
                id="eventEnd"
                type="time"
                {...register('endTime')}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              />
              {errors.endTime ? (
                <p className="mt-1 text-xs text-red-300">{errors.endTime.message}</p>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor="eventCash" className="mb-1.5 block text-sm text-neutral-300">
              Fondo de caja
            </label>
            <input
              id="eventCash"
              type="number"
              min="0"
              step="0.01"
              {...register('openingCash', { valueAsNumber: true })}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            />
            {errors.openingCash ? (
              <p className="mt-1 text-xs text-red-300">{errors.openingCash.message}</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <div>
            <h2 className="font-semibold">Promoción del evento</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Se aplica a las bebidas marcadas como elegibles al registrar una venta.
            </p>
          </div>

          <label className="flex items-center gap-3 text-sm text-neutral-300">
            <input
              type="checkbox"
              {...register('promotionEnabled')}
              className="size-4 rounded border-neutral-600 bg-neutral-950"
            />
            Activar promoción
          </label>

          {promotionEnabled ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bundleQty" className="mb-1.5 block text-sm text-neutral-300">
                  Bebidas
                </label>
                <input
                  id="bundleQty"
                  type="number"
                  min="2"
                  step="1"
                  {...register('bundleQty', { valueAsNumber: true })}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                />
                {errors.bundleQty ? (
                  <p className="mt-1 text-xs text-red-300">{errors.bundleQty.message}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="bundlePrice" className="mb-1.5 block text-sm text-neutral-300">
                  Precio del paquete
                </label>
                <input
                  id="bundlePrice"
                  type="number"
                  min="0"
                  step="0.01"
                  {...register('bundlePrice', { valueAsNumber: true })}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                />
                {errors.bundlePrice ? (
                  <p className="mt-1 text-xs text-red-300">{errors.bundlePrice.message}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <label htmlFor="eventNotes" className="mb-1.5 block text-sm text-neutral-300">
            Notas
          </label>
          <textarea
            id="eventNotes"
            rows={3}
            placeholder="Opcional"
            {...register('notes')}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
          />
          {errors.notes ? (
            <p className="mt-1 text-xs text-red-300">{errors.notes.message}</p>
          ) : null}
        </section>

        {saveMutation.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {saveMutation.error.message}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting || saveMutation.isPending}
            className="flex-1 rounded-xl bg-brand-400 px-4 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:opacity-60"
          >
            {saveMutation.isPending ? 'Guardando…' : 'Guardar evento'}
          </button>
          <Link
            to={isNew ? '/eventos' : `/eventos/${id}`}
            className="rounded-xl border border-neutral-700 px-4 py-3 text-sm text-neutral-300"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
