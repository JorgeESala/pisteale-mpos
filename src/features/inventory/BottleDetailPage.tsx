import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatCurrency, formatUnitCost } from '@/lib/format'
import {
  closeBottleFormSchema,
  consumeBottleFormSchema,
  type CloseBottleForm,
  type ConsumeBottleForm,
} from './inventory-schemas'
import {
  closeOpenBottle,
  consumeOpenBottle,
  fetchBottleMovements,
  fetchBottleOpening,
} from './queries'
import {
  bottleStatusLabels,
  formatDate,
  formatDateTime,
  formatQty,
  movementLabels,
} from './inventory-utils'

const movementClasses: Record<string, string> = {
  consumption: 'bg-orange-500/15 text-orange-300',
  waste: 'bg-red-500/15 text-red-300',
}

export function BottleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const canAdjust = profile?.role === 'admin' || profile?.can_adjust_inventory === true

  const bottleQuery = useQuery({
    queryKey: ['bottle_opening', id],
    queryFn: () => fetchBottleOpening(id!),
    enabled: Boolean(id),
  })

  const movementsQuery = useQuery({
    queryKey: ['bottle_movements', id],
    queryFn: () => fetchBottleMovements(id!),
    enabled: Boolean(id),
  })

  const consumeForm = useForm<ConsumeBottleForm>({
    resolver: zodResolver(consumeBottleFormSchema),
    defaultValues: { qtyMl: 0, notes: '' },
  })

  const closeForm = useForm<CloseBottleForm>({
    resolver: zodResolver(closeBottleFormSchema),
    defaultValues: { leftoverMl: 0, notes: '' },
  })

  const consumedQty = Number(useWatch({ control: consumeForm.control, name: 'qtyMl' })) || 0
  const leftoverQty = Number(useWatch({ control: closeForm.control, name: 'leftoverMl' })) || 0

  const invalidateBottle = () => {
    void queryClient.invalidateQueries({ queryKey: ['bottle_opening', id] })
    void queryClient.invalidateQueries({ queryKey: ['bottle_openings'] })
    void queryClient.invalidateQueries({ queryKey: ['bottle_stock'] })
    void queryClient.invalidateQueries({ queryKey: ['bottle_movements', id] })
    void queryClient.invalidateQueries({ queryKey: ['inventory_stock'] })
    void queryClient.invalidateQueries({ queryKey: ['inventory_stock_item'] })
    void queryClient.invalidateQueries({ queryKey: ['inventory_movements'] })
    void queryClient.invalidateQueries({ queryKey: ['inventory_waste'] })
  }

  const consumeMutation = useMutation({
    mutationFn: (values: ConsumeBottleForm) =>
      consumeOpenBottle({
        bottleId: id!,
        qtyMl: values.qtyMl,
        notes: values.notes,
      }),
    onSuccess: () => {
      invalidateBottle()
      consumeForm.reset({ qtyMl: 0, notes: '' })
    },
  })

  const closeMutation = useMutation({
    mutationFn: (values: CloseBottleForm) =>
      closeOpenBottle({
        bottleId: id!,
        leftoverMl: values.leftoverMl,
        notes: values.notes,
      }),
    onSuccess: () => {
      invalidateBottle()
      closeForm.reset({ leftoverMl: 0, notes: '' })
    },
  })

  async function onConsume(values: ConsumeBottleForm) {
    await consumeMutation.mutateAsync(values)
  }

  async function onClose(values: CloseBottleForm) {
    await closeMutation.mutateAsync(values)
  }

  if (!id) {
    return <p className="text-sm text-red-300">Botella no encontrada.</p>
  }

  if (bottleQuery.isLoading || movementsQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando botella…</p>
  }

  if (bottleQuery.isError || movementsQuery.isError) {
    const error = bottleQuery.error ?? movementsQuery.error
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error?.message}
      </p>
    )
  }

  const bottle = bottleQuery.data
  const movements = movementsQuery.data ?? []

  if (!bottle) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">No se encontró la botella.</p>
        <Link to="/insumos/botellas" className="text-sm text-brand-300 underline">
          Volver a botellas
        </Link>
      </div>
    )
  }

  const isOpen = bottle.status === 'open'
  const consumedPreview = Math.max(
    0,
    Math.round((bottle.remaining_ml - leftoverQty) * 10000) / 10000,
  )
  const wasteCost = Math.round(leftoverQty * bottle.avg_cost * 100) / 100
  const consumeExceeds = consumedQty > bottle.remaining_ml
  const closeExceeds = leftoverQty > bottle.remaining_ml

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Botella abierta</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{bottle.item_name}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {bottle.group_name} · abierta {formatDate(bottle.opening_date)}
          </p>
        </div>
        <Link
          to="/insumos/botellas"
          className="shrink-0 rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
        >
          Volver
        </Link>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-neutral-500">Contenido restante</p>
            <p className="mt-1 text-3xl font-semibold">{formatQty(bottle.remaining_ml, 'ml')}</p>
            <p className="mt-1 text-xs text-neutral-500">
              Inicial {formatQty(bottle.initial_ml, 'ml')} · salido{' '}
              {formatQty(bottle.consumed_ml, 'ml')}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${
              isOpen ? 'bg-green-500/15 text-green-300' : 'bg-neutral-800 text-neutral-400'
            }`}
          >
            {bottleStatusLabels[bottle.status]}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-neutral-500">Costo promedio</p>
            <p>
              {formatUnitCost(bottle.avg_cost)}
              <span className="ml-1 text-xs text-neutral-500">/ml</span>
            </p>
          </div>
          <div>
            <p className="text-neutral-500">Valor restante</p>
            <p>{formatCurrency(bottle.remaining_value)}</p>
          </div>
          <div>
            <p className="text-neutral-500">Abrió</p>
            <p>{bottle.created_by_name ?? '—'}</p>
          </div>
          <div>
            <p className="text-neutral-500">Cierre</p>
            <p>{bottle.finished_at ? formatDateTime(bottle.finished_at) : '—'}</p>
          </div>
        </div>

        {bottle.notes ? (
          <p className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
            {bottle.notes}
          </p>
        ) : null}
      </section>

      {isOpen && canAdjust ? (
        <div className="space-y-4">
          <form
            className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
            onSubmit={consumeForm.handleSubmit(onConsume)}
            noValidate
          >
            <div>
              <h2 className="font-semibold">Registrar consumo</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Descuenta del stock el líquido consumido y reduce el contenido de la botella.
              </p>
            </div>

            <div>
              <label htmlFor="consumeQty" className="mb-1.5 block text-sm text-neutral-300">
                Cantidad consumida (ml)
              </label>
              <input
                id="consumeQty"
                type="number"
                min="0.0001"
                step="0.0001"
                max={bottle.remaining_ml}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...consumeForm.register('qtyMl', { valueAsNumber: true })}
              />
              {consumeForm.formState.errors.qtyMl ? (
                <p className="mt-1.5 text-sm text-red-400">
                  {consumeForm.formState.errors.qtyMl.message}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="consumeNotes" className="mb-1.5 block text-sm text-neutral-300">
                Notas
              </label>
              <textarea
                id="consumeNotes"
                rows={2}
                placeholder="Opcional"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...consumeForm.register('notes')}
              />
            </div>

            {consumeExceeds ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                La cantidad supera el contenido de la botella.
              </p>
            ) : null}

            {consumeMutation.isError ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {consumeMutation.error.message}
              </p>
            ) : null}

            {consumeMutation.isSuccess ? (
              <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
                Consumo registrado. Quedan {formatQty(consumeMutation.data ?? 0, 'ml')}.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={consumeForm.formState.isSubmitting || consumeExceeds}
              className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {consumeForm.formState.isSubmitting ? 'Guardando…' : 'Registrar consumo'}
            </button>
          </form>

          <form
            className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
            onSubmit={closeForm.handleSubmit(onClose)}
            noValidate
          >
            <div>
              <h2 className="font-semibold">Cerrar con merma</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Captura el sobrante que se tira. La diferencia contra el contenido actual se
                registra como consumo y el sobrante como merma de fondo de botella.
              </p>
            </div>

            <div>
              <label htmlFor="leftoverQty" className="mb-1.5 block text-sm text-neutral-300">
                Sobrante que se tira (ml)
              </label>
              <input
                id="leftoverQty"
                type="number"
                min="0"
                step="0.0001"
                max={bottle.remaining_ml}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...closeForm.register('leftoverMl', { valueAsNumber: true })}
              />
              {closeForm.formState.errors.leftoverMl ? (
                <p className="mt-1.5 text-sm text-red-400">
                  {closeForm.formState.errors.leftoverMl.message}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
              Consumo: {formatQty(consumedPreview, 'ml')} · merma: {formatQty(leftoverQty, 'ml')} (
              {formatCurrency(wasteCost)})
            </div>

            <div>
              <label htmlFor="closeNotes" className="mb-1.5 block text-sm text-neutral-300">
                Notas
              </label>
              <textarea
                id="closeNotes"
                rows={2}
                placeholder="Opcional"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...closeForm.register('notes')}
              />
            </div>

            {closeExceeds ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                El sobrante supera el contenido de la botella.
              </p>
            ) : null}

            {closeMutation.isError ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {closeMutation.error.message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={closeForm.formState.isSubmitting || closeExceeds}
              className="w-full rounded-xl border border-red-500/50 px-4 py-3.5 text-base font-semibold text-red-300 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {closeForm.formState.isSubmitting ? 'Cerrando…' : 'Cerrar botella y registrar merma'}
            </button>
          </form>
        </div>
      ) : null}

      {closeMutation.isSuccess ? (
        <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
          Botella cerrada.
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-semibold">Movimientos de la botella</h2>
          <p className="text-xs text-neutral-500">
            {movements.length} {movements.length === 1 ? 'registro' : 'registros'}
          </p>
        </div>

        {movements.length === 0 ? (
          <p className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
            Aún no hay consumos ni mermas de esta botella.
          </p>
        ) : null}

        {movements.map((movement) => (
          <article
            key={movement.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-[11px] ${
                    movementClasses[movement.movement_type] ?? 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {movementLabels[movement.movement_type]}
                </span>
                <p className="mt-2 text-sm text-neutral-400">
                  {formatDateTime(movement.occurred_at)}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm font-semibold">
                <span className={movement.qty_base > 0 ? 'text-green-300' : 'text-red-300'}>
                  {movement.qty_base > 0 ? '+' : ''}
                  {formatQty(movement.qty_base, 'ml')}
                </span>
                <span className="block text-[11px] font-normal text-neutral-500">
                  {formatCurrency(movement.total_cost)}
                </span>
              </p>
            </div>

            {movement.notes ? (
              <p className="mt-2 text-sm text-neutral-400">{movement.notes}</p>
            ) : null}
          </article>
        ))}
      </section>

      {!canAdjust && isOpen ? (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
          No tienes permiso para consumir o cerrar esta botella.
        </section>
      ) : null}
    </div>
  )
}
