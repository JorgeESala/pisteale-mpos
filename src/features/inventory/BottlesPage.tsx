import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatCurrency, formatUnitCost } from '@/lib/format'
import { openBottleFormSchema, type OpenBottleForm } from './inventory-schemas'
import { fetchBottleOpenings, fetchBottleStock, openBottle } from './queries'
import { formatDate, formatQty } from './inventory-utils'

function todayIso() {
  return new Date().toLocaleDateString('en-CA')
}

export function BottlesPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const canAdjust = profile?.role === 'admin' || profile?.can_adjust_inventory === true

  const stockQuery = useQuery({
    queryKey: ['bottle_stock'],
    queryFn: fetchBottleStock,
  })

  const openingsQuery = useQuery({
    queryKey: ['bottle_openings'],
    queryFn: () => fetchBottleOpenings(),
  })

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OpenBottleForm>({
    resolver: zodResolver(openBottleFormSchema),
    defaultValues: {
      openingDate: todayIso(),
      itemId: '',
      initialMl: 750,
      notes: '',
    },
  })

  const selectedItemId = useWatch({ control, name: 'itemId' })
  const watchedInitial = Number(useWatch({ control, name: 'initialMl' })) || 0
  const stockItems = (stockQuery.data ?? [])
    .filter(
      (item) => item.track_stock && item.active && item.base_unit === 'ml' && item.sealed_ml > 0,
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  const selectedItem = stockItems.find((item) => item.item_id === selectedItemId)
  const selectedStockItemId = selectedItem?.item_id
  const selectedPurchaseFactor = selectedItem?.purchase_factor

  useEffect(() => {
    if (!selectedStockItemId || !selectedPurchaseFactor) return

    setValue('initialMl', selectedPurchaseFactor)
  }, [selectedStockItemId, selectedPurchaseFactor, setValue])

  const openMutation = useMutation({
    mutationFn: (values: OpenBottleForm) =>
      openBottle({
        itemId: values.itemId,
        openingDate: values.openingDate,
        initialMl: values.initialMl,
        notes: values.notes,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bottle_stock'] })
      void queryClient.invalidateQueries({ queryKey: ['bottle_openings'] })
      reset({
        openingDate: todayIso(),
        itemId: '',
        initialMl: 750,
        notes: '',
      })
    },
  })

  async function onSubmit(values: OpenBottleForm) {
    await openMutation.mutateAsync(values)
  }

  if (stockQuery.isLoading || openingsQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando botellas…</p>
  }

  if (stockQuery.isError || openingsQuery.isError) {
    const error = stockQuery.error ?? openingsQuery.error
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error?.message}
      </p>
    )
  }

  const openings = openingsQuery.data ?? []
  const openBottles = openings.filter((bottle) => bottle.status === 'open')
  const finishedBottles = openings.filter((bottle) => bottle.status === 'finished').slice(0, 5)
  const openMl = openBottles.reduce((sum, bottle) => sum + bottle.remaining_ml, 0)
  const openValue = openBottles.reduce((sum, bottle) => sum + bottle.remaining_value, 0)
  const exceedsSealed = Boolean(selectedItem && watchedInitial > selectedItem.sealed_ml)

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Insumos</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Botellas abiertas</h1>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            to="/insumos/stock"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Stock
          </Link>
          <Link
            to="/insumos/merma"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Merma
          </Link>
          <Link
            to="/reportes"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Reportes
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
        El stock total incluye el líquido de las botellas abiertas. Solo puedes abrir una botella
        cuando hay suficiente stock sellado.
      </section>

      {canAdjust ? (
        <form
          className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <div>
            <h2 className="font-semibold">Abrir botella</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Abrir una botella no descuenta stock; el líquido sigue disponible hasta consumirse o
              mermarse.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="openingDate" className="mb-1.5 block text-sm text-neutral-300">
                Fecha
              </label>
              <input
                id="openingDate"
                type="date"
                max={todayIso()}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...register('openingDate')}
              />
              {errors.openingDate ? (
                <p className="mt-1.5 text-sm text-red-400">{errors.openingDate.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="initialMl" className="mb-1.5 block text-sm text-neutral-300">
                Contenido (ml)
              </label>
              <input
                id="initialMl"
                type="number"
                min="0.0001"
                step="0.0001"
                max={selectedItem?.sealed_ml}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...register('initialMl', { valueAsNumber: true })}
              />
              {errors.initialMl ? (
                <p className="mt-1.5 text-sm text-red-400">{errors.initialMl.message}</p>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor="openingItemId" className="mb-1.5 block text-sm text-neutral-300">
              Insumo
            </label>
            <select
              id="openingItemId"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('itemId')}
            >
              <option value="">Selecciona un insumo</option>
              {stockItems.map((item) => (
                <option key={item.item_id} value={item.item_id}>
                  {item.name} ({item.group_name}) · sellado{' '}
                  {formatQty(item.sealed_ml, item.base_unit)}
                </option>
              ))}
            </select>
            {errors.itemId ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.itemId.message}</p>
            ) : null}
            {stockItems.length === 0 ? (
              <p className="mt-1.5 text-sm text-amber-300">
                No hay stock sellado disponible para abrir botellas.
              </p>
            ) : null}
          </div>

          {selectedItem ? (
            <p className="text-[11px] text-neutral-500">
              Sellado: {formatQty(selectedItem.sealed_ml, 'ml')} · abierto:{' '}
              {formatQty(selectedItem.open_ml, 'ml')} · costo promedio:{' '}
              {formatUnitCost(selectedItem.avg_cost)}/ml
            </p>
          ) : null}

          {exceedsSealed ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              El contenido supera el stock sellado disponible.
            </p>
          ) : null}

          <div>
            <label htmlFor="openingNotes" className="mb-1.5 block text-sm text-neutral-300">
              Notas
            </label>
            <textarea
              id="openingNotes"
              rows={2}
              placeholder="Opcional"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('notes')}
            />
            {errors.notes ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.notes.message}</p>
            ) : null}
          </div>

          {openMutation.isError ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {openMutation.error.message}
            </p>
          ) : null}

          {openMutation.isSuccess ? (
            <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
              Botella abierta.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || exceedsSealed || stockItems.length === 0}
            className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Guardando…' : 'Abrir botella'}
          </button>
        </form>
      ) : (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
          <p className="text-sm">No tienes permiso para abrir o cerrar botellas.</p>
        </section>
      )}

      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Abiertas</p>
          <p className="mt-1 text-lg font-semibold">{openBottles.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Líquido abierto</p>
          <p className="mt-1 text-lg font-semibold">{formatQty(openMl, 'ml')}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Valor abierto</p>
          <p className="mt-1 text-lg font-semibold">{formatCurrency(openValue)}</p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-semibold">Botellas abiertas</h2>
          <p className="text-xs text-neutral-500">
            {openBottles.length} {openBottles.length === 1 ? 'botella' : 'botellas'}
          </p>
        </div>

        {openBottles.length === 0 ? (
          <p className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
            No hay botellas abiertas.
          </p>
        ) : null}

        {openBottles.map((bottle) => (
          <Link
            key={bottle.id}
            to={`/insumos/botellas/${bottle.id}`}
            className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-600"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{bottle.item_name}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {bottle.group_name} · abierta {formatDate(bottle.opening_date)}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm font-semibold">
                {formatQty(bottle.remaining_ml, 'ml')}
                <span className="block text-[11px] font-normal text-neutral-500">
                  de {formatQty(bottle.initial_ml, 'ml')}
                </span>
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-400">
              <span className="rounded-full bg-neutral-800 px-2 py-1">
                Salido: {formatQty(bottle.consumed_ml, 'ml')}
              </span>
              <span className="rounded-full bg-neutral-800 px-2 py-1">
                Valor: {formatCurrency(bottle.remaining_value)}
              </span>
            </div>
          </Link>
        ))}
      </section>

      {finishedBottles.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Cerradas recientes</h2>
          {finishedBottles.map((bottle) => (
            <Link
              key={bottle.id}
              to={`/insumos/botellas/${bottle.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-3 text-sm transition hover:border-neutral-600"
            >
              <div>
                <p className="font-medium">{bottle.item_name}</p>
                <p className="text-xs text-neutral-500">
                  {formatDate(bottle.opening_date)} · salido {formatQty(bottle.consumed_ml, 'ml')}
                </p>
              </div>
              <span className="rounded-full bg-neutral-800 px-2 py-1 text-[11px] text-neutral-400">
                Cerrada
              </span>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  )
}
