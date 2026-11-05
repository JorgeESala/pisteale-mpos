import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatCurrency } from '@/lib/format'
import { iceDailyRecordFormSchema, type IceDailyRecordForm } from './catalog-schemas'
import {
  deleteIceDailyRecord,
  fetchIceCost7d,
  fetchIceDailyRecords,
  upsertIceDailyRecord,
} from './queries'

function todayIso() {
  return new Date().toLocaleDateString('en-CA')
}

function formatDate(value: string | null) {
  if (!value) return ''

  return new Date(`${value}T12:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function IceDailyPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const canEdit = profile?.role === 'admin' || profile?.role === 'operador'
  const isAdmin = profile?.role === 'admin'

  const recordsQuery = useQuery({
    queryKey: ['ice_daily_records'],
    queryFn: fetchIceDailyRecords,
  })

  const averageQuery = useQuery({
    queryKey: ['ice_cost_7d'],
    queryFn: fetchIceCost7d,
  })

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<IceDailyRecordForm>({
    resolver: zodResolver(iceDailyRecordFormSchema),
    defaultValues: {
      recordDate: todayIso(),
      bags: null,
      totalCost: 0,
      drinksSold: 0,
      notes: '',
    },
  })

  const watchedDate = useWatch({ control, name: 'recordDate' }) ?? todayIso()
  const watchedTotalCost = Number(useWatch({ control, name: 'totalCost' })) || 0
  const watchedDrinksSold = Number(useWatch({ control, name: 'drinksSold' })) || 0
  const records = recordsQuery.data ?? []
  const existing = records.find((record) => record.record_date === watchedDate)
  const existingId = existing?.id
  const existingBags = existing?.bags
  const existingTotalCost = existing?.total_cost
  const existingDrinksSold = existing?.drinks_sold
  const existingNotes = existing?.notes

  useEffect(() => {
    if (recordsQuery.isLoading) return

    reset({
      recordDate: watchedDate,
      bags: existingBags ?? null,
      totalCost: existingTotalCost ?? 0,
      drinksSold: existingDrinksSold ?? 0,
      notes: existingNotes ?? '',
    })
  }, [
    watchedDate,
    existingBags,
    existingTotalCost,
    existingDrinksSold,
    existingNotes,
    recordsQuery.isLoading,
    reset,
  ])

  const saveMutation = useMutation({
    mutationFn: (values: IceDailyRecordForm) =>
      upsertIceDailyRecord({
        id: existingId ?? null,
        recordDate: values.recordDate,
        bags: values.bags,
        totalCost: values.totalCost,
        drinksSold: values.drinksSold,
        notes: values.notes ?? '',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ice_daily_records'] })
      void queryClient.invalidateQueries({ queryKey: ['ice_cost_7d'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteIceDailyRecord,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ice_daily_records'] })
      void queryClient.invalidateQueries({ queryKey: ['ice_cost_7d'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  async function onSubmit(values: IceDailyRecordForm) {
    await saveMutation.mutateAsync(values)
  }

  function onEdit(record: (typeof records)[number]) {
    reset({
      recordDate: record.record_date,
      bags: record.bags,
      totalCost: record.total_cost,
      drinksSold: record.drinks_sold,
      notes: record.notes,
    })
  }

  const average = averageQuery.data
  const previewCost =
    watchedDrinksSold > 0 ? Math.round((watchedTotalCost / watchedDrinksSold) * 100) / 100 : null

  if (recordsQuery.isLoading || averageQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando hielo diario…</p>
  }

  if (recordsQuery.isError || averageQuery.isError) {
    const error = recordsQuery.error ?? averageQuery.error
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error?.message}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Insumos</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hielo del día</h1>
        </div>
        <Link
          to="/insumos"
          className="shrink-0 rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
        >
          Volver
        </Link>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-sm text-neutral-300">
          El hielo no lleva stock. Cada día con venta registra lo que gastaste y las bebidas
          vendidas; el sistema calcula el costo por bebida y el promedio de los últimos 7 cierres.
        </p>
        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
          <p className="text-xs text-neutral-500">Costo de hielo para catálogo</p>
          <p className="mt-1 text-2xl font-semibold">
            {average?.cost_per_drink !== null && average?.cost_per_drink !== undefined
              ? `${formatCurrency(average.cost_per_drink)} / bebida`
              : 'Pendiente'}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {average && average.days_count > 0
              ? `${average.days_count} ${average.days_count === 1 ? 'cierre' : 'cierres'} · ${formatDate(average.date_from)} a ${formatDate(average.date_to)}`
              : 'Sin cierres registrados'}
          </p>
        </div>
      </section>

      {canEdit ? (
        <form
          className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <div>
            <h2 className="font-semibold">Registrar cierre</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Una captura por fecha. Si ya existe, se actualiza.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="recordDate" className="mb-1.5 block text-sm text-neutral-300">
                Fecha
              </label>
              <input
                id="recordDate"
                type="date"
                max={todayIso()}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...register('recordDate')}
              />
              {errors.recordDate ? (
                <p className="mt-1.5 text-sm text-red-400">{errors.recordDate.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="bags" className="mb-1.5 block text-sm text-neutral-300">
                Bolsas usadas (opcional)
              </label>
              <input
                id="bags"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ej. 2"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...register('bags', {
                  setValueAs: (value) => (value === '' ? null : Number(value)),
                })}
              />
              {errors.bags ? (
                <p className="mt-1.5 text-sm text-red-400">{errors.bags.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="totalCost" className="mb-1.5 block text-sm text-neutral-300">
                Gasto total de hielo
              </label>
              <input
                id="totalCost"
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...register('totalCost', { valueAsNumber: true })}
              />
              {errors.totalCost ? (
                <p className="mt-1.5 text-sm text-red-400">{errors.totalCost.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="drinksSold" className="mb-1.5 block text-sm text-neutral-300">
                Bebidas vendidas
              </label>
              <input
                id="drinksSold"
                type="number"
                min="1"
                step="1"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...register('drinksSold', { valueAsNumber: true })}
              />
              {errors.drinksSold ? (
                <p className="mt-1.5 text-sm text-red-400">{errors.drinksSold.message}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
            Costo por bebida del día:{' '}
            <span className="font-semibold text-neutral-100">
              {previewCost === null ? '—' : formatCurrency(previewCost)}
            </span>
          </div>

          <div>
            <label htmlFor="notes" className="mb-1.5 block text-sm text-neutral-300">
              Notas
            </label>
            <textarea
              id="notes"
              rows={2}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('notes')}
            />
            {errors.notes ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.notes.message}</p>
            ) : null}
          </div>

          {saveMutation.isError ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {saveMutation.error.message}
            </p>
          ) : null}

          {saveMutation.isSuccess ? (
            <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
              Cierre de hielo guardado.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Guardando…' : existing ? 'Actualizar cierre' : 'Guardar cierre'}
          </button>
        </form>
      ) : (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
          <p className="text-sm">
            Solo administradores y operadores pueden capturar el hielo diario.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-semibold">Últimos cierres</h2>
          <p className="text-xs text-neutral-500">
            {records.length} {records.length === 1 ? 'registro' : 'registros'}
          </p>
        </div>

        {records.length === 0 ? (
          <p className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
            Aún no hay cierres de hielo.
          </p>
        ) : null}

        {records.map((record) => (
          <article
            key={record.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{formatDate(record.record_date)}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {record.bags !== null
                    ? `${record.bags} ${record.bags === 1 ? 'bolsa' : 'bolsas'} · `
                    : ''}
                  {formatCurrency(record.total_cost)} · {record.drinks_sold} bebidas
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold">
                {formatCurrency(record.cost_per_drink)}
                <span className="ml-1 text-[11px] font-normal text-neutral-500">/bebida</span>
              </p>
            </div>

            {record.notes ? <p className="mt-2 text-sm text-neutral-400">{record.notes}</p> : null}

            {canEdit ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(record)}
                  className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
                >
                  Editar
                </button>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(record.id)}
                    disabled={deleteMutation.isPending}
                    className="rounded-xl border border-red-500/40 px-3 py-2 text-sm text-red-300 transition hover:border-red-400 disabled:opacity-60"
                  >
                    Eliminar
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}

        {deleteMutation.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {deleteMutation.error.message}
          </p>
        ) : null}
      </section>
    </div>
  )
}
