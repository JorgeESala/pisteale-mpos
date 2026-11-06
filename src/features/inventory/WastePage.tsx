import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatCurrency } from '@/lib/format'
import { inventoryWasteFormSchema, type InventoryWasteForm } from './inventory-schemas'
import { createInventoryWaste, fetchInventoryStock, fetchInventoryWaste } from './queries'
import { formatDate, formatQty, wasteReasonLabels } from './inventory-utils'

function todayIso() {
  return new Date().toLocaleDateString('en-CA')
}

export function WastePage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const canAdjust = profile?.role === 'admin' || profile?.can_adjust_inventory === true

  const stockQuery = useQuery({
    queryKey: ['inventory_stock'],
    queryFn: fetchInventoryStock,
  })

  const wasteQuery = useQuery({
    queryKey: ['inventory_waste'],
    queryFn: () => fetchInventoryWaste(undefined, undefined, 100),
  })

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InventoryWasteForm>({
    resolver: zodResolver(inventoryWasteFormSchema),
    defaultValues: {
      wasteDate: todayIso(),
      itemId: '',
      qty: 0,
      reason: 'fondo_botella',
      notes: '',
    },
  })

  const selectedItemId = useWatch({ control, name: 'itemId' })
  const watchedQty = Number(useWatch({ control, name: 'qty' })) || 0
  const stockItems = (stockQuery.data ?? [])
    .filter((item) => item.track_stock && item.current_qty_base > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
  const selectedItem = stockItems.find((item) => item.item_id === selectedItemId)
  const previewCost = selectedItem ? watchedQty * selectedItem.avg_cost : 0
  const exceedsStock = Boolean(selectedItem && watchedQty > selectedItem.current_qty_base)

  const createMutation = useMutation({
    mutationFn: (values: InventoryWasteForm) =>
      createInventoryWaste({
        itemId: values.itemId,
        wasteDate: values.wasteDate,
        qty: values.qty,
        reason: values.reason,
        notes: values.notes,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory_waste'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_stock'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_stock_item'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_movements'] })
      reset({
        wasteDate: todayIso(),
        itemId: '',
        qty: 0,
        reason: 'fondo_botella',
        notes: '',
      })
    },
  })

  async function onSubmit(values: InventoryWasteForm) {
    await createMutation.mutateAsync(values)
  }

  if (stockQuery.isLoading || wasteQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando merma…</p>
  }

  if (stockQuery.isError || wasteQuery.isError) {
    const error = stockQuery.error ?? wasteQuery.error
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error?.message}
      </p>
    )
  }

  const waste = wasteQuery.data ?? []
  const totalWaste = waste.reduce((sum, record) => sum + record.total_cost, 0)

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Insumos</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Merma</h1>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            to="/insumos/stock"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Stock
          </Link>
          <Link
            to="/insumos/movimientos"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Movimientos
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
        Registra aquí las mermas de insumos con stock. El hielo se captura en{' '}
        <Link to="/insumos/hielo" className="text-brand-300 underline">
          Hielo del día
        </Link>
        .
      </section>

      {canAdjust ? (
        <form
          className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <div>
            <h2 className="font-semibold">Registrar merma</h2>
            <p className="mt-1 text-sm text-neutral-400">
              El costo se toma del costo promedio actual del insumo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="wasteDate" className="mb-1.5 block text-sm text-neutral-300">
                Fecha
              </label>
              <input
                id="wasteDate"
                type="date"
                max={todayIso()}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...register('wasteDate')}
              />
              {errors.wasteDate ? (
                <p className="mt-1.5 text-sm text-red-400">{errors.wasteDate.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="wasteReason" className="mb-1.5 block text-sm text-neutral-300">
                Motivo
              </label>
              <select
                id="wasteReason"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...register('reason')}
              >
                {Object.entries(wasteReasonLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {errors.reason ? (
                <p className="mt-1.5 text-sm text-red-400">{errors.reason.message}</p>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor="wasteItemId" className="mb-1.5 block text-sm text-neutral-300">
              Insumo
            </label>
            <select
              id="wasteItemId"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('itemId')}
            >
              <option value="">Selecciona un insumo</option>
              {stockItems.map((item) => (
                <option key={item.item_id} value={item.item_id}>
                  {item.name} ({item.group_name}) ·{' '}
                  {formatQty(item.current_qty_base, item.base_unit)}
                </option>
              ))}
            </select>
            {errors.itemId ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.itemId.message}</p>
            ) : null}
            {stockItems.length === 0 ? (
              <p className="mt-1.5 text-sm text-amber-300">
                No hay insumos con stock para registrar merma.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="wasteQty" className="mb-1.5 block text-sm text-neutral-300">
                Cantidad ({selectedItem?.base_unit ?? 'unidad base'})
              </label>
              <input
                id="wasteQty"
                type="number"
                min="0.0001"
                step="0.0001"
                max={selectedItem?.current_qty_base}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...register('qty', { valueAsNumber: true })}
              />
              {errors.qty ? (
                <p className="mt-1.5 text-sm text-red-400">{errors.qty.message}</p>
              ) : null}
            </div>

            <div>
              <p className="mb-1.5 text-sm text-neutral-300">Costo estimado</p>
              <p className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-base">
                {formatCurrency(previewCost)}
              </p>
            </div>
          </div>

          {selectedItem ? (
            <p className="text-[11px] text-neutral-500">
              Disponible: {formatQty(selectedItem.current_qty_base, selectedItem.base_unit)} · costo
              promedio: {formatCurrency(selectedItem.avg_cost)}/{selectedItem.base_unit}
            </p>
          ) : null}

          {exceedsStock ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              La cantidad supera el stock disponible.
            </p>
          ) : null}

          <div>
            <label htmlFor="wasteNotes" className="mb-1.5 block text-sm text-neutral-300">
              Notas
            </label>
            <textarea
              id="wasteNotes"
              rows={2}
              placeholder="Opcional"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('notes')}
            />
            {errors.notes ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.notes.message}</p>
            ) : null}
          </div>

          {createMutation.isError ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {createMutation.error.message}
            </p>
          ) : null}

          {createMutation.isSuccess ? (
            <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
              Merma registrada.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || exceedsStock || stockItems.length === 0}
            className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Guardando…' : 'Guardar merma'}
          </button>
        </form>
      ) : (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
          <p className="text-sm">No tienes permiso para registrar merma.</p>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-semibold">Mermas recientes</h2>
          <p className="text-xs text-neutral-500">
            {waste.length} {waste.length === 1 ? 'registro' : 'registros'} ·{' '}
            {formatCurrency(totalWaste)}
          </p>
        </div>

        {waste.length === 0 ? (
          <p className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
            Aún no hay mermas registradas.
          </p>
        ) : null}

        {waste.map((record) => (
          <article
            key={record.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full bg-red-500/15 px-2 py-1 text-[11px] text-red-300">
                    {wasteReasonLabels[record.reason]}
                  </span>
                  <Link
                    to={`/insumos/stock/${record.item_id}`}
                    className="truncate text-sm font-semibold text-brand-300 underline"
                  >
                    {record.item_name}
                  </Link>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {record.group_name} · {formatDate(record.waste_date)}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm font-semibold">
                <span className="text-red-300">
                  -{formatQty(record.qty_base, record.base_unit)}
                </span>
                <span className="block text-[11px] font-normal text-neutral-500">
                  {formatCurrency(record.total_cost)}
                </span>
              </p>
            </div>

            {record.notes ? <p className="mt-2 text-sm text-neutral-400">{record.notes}</p> : null}

            {record.created_by_name ? (
              <p className="mt-2 text-[11px] text-neutral-500">{record.created_by_name}</p>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  )
}
