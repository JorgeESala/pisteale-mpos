import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatCurrency, formatUnitCost } from '@/lib/format'
import { inventoryAdjustmentFormSchema, type InventoryAdjustmentForm } from './inventory-schemas'
import { adjustInventoryItem, fetchInventoryMovements, fetchInventoryStockItem } from './queries'
import { formatDateTime, formatQty, movementLabels, stockStatusLabels } from './inventory-utils'

const statusClasses = {
  ok: 'bg-green-500/15 text-green-300',
  low: 'bg-yellow-500/15 text-yellow-300',
  out: 'bg-red-500/15 text-red-300',
  negative: 'bg-red-500/15 text-red-300',
  no_stock: 'bg-neutral-800 text-neutral-400',
}

const movementClasses: Record<string, string> = {
  purchase: 'bg-blue-500/15 text-blue-300',
  adjustment: 'bg-yellow-500/15 text-yellow-300',
  opening: 'bg-purple-500/15 text-purple-300',
  consumption: 'bg-orange-500/15 text-orange-300',
  waste: 'bg-red-500/15 text-red-300',
  transfer: 'bg-neutral-800 text-neutral-400',
}

export function StockDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const canAdjust = profile?.role === 'admin' || profile?.can_adjust_inventory === true

  const stockQuery = useQuery({
    queryKey: ['inventory_stock_item', id],
    queryFn: () => fetchInventoryStockItem(id!),
    enabled: Boolean(id),
  })

  const movementsQuery = useQuery({
    queryKey: ['inventory_movements', id],
    queryFn: () => fetchInventoryMovements(id, 50),
    enabled: Boolean(id),
  })

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InventoryAdjustmentForm>({
    resolver: zodResolver(inventoryAdjustmentFormSchema),
    defaultValues: {
      countedQty: 0,
      notes: '',
    },
  })

  const stock = stockQuery.data ?? null
  const stockItemId = stock?.item_id
  const stockQty = stock?.current_qty_base
  const currentQty = stockQty ?? 0
  const countedQty = Number(useWatch({ control, name: 'countedQty' })) || 0

  useEffect(() => {
    if (!stockItemId) return

    reset({
      countedQty: stockQty ?? 0,
      notes: '',
    })
  }, [stockItemId, stockQty, reset])

  const adjustMutation = useMutation({
    mutationFn: (values: InventoryAdjustmentForm) =>
      adjustInventoryItem({
        itemId: id!,
        countedQty: values.countedQty,
        notes: values.notes,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory_stock'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_stock_item', id] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_movements'] })
    },
  })

  async function onSubmit(values: InventoryAdjustmentForm) {
    await adjustMutation.mutateAsync(values)
  }

  if (!id) {
    return <p className="text-sm text-red-300">Insumo no encontrado.</p>
  }

  if (stockQuery.isLoading || movementsQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando stock…</p>
  }

  if (stockQuery.isError || movementsQuery.isError) {
    const error = stockQuery.error ?? movementsQuery.error
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error?.message}
      </p>
    )
  }

  if (!stock) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">No se encontró el insumo.</p>
        <Link to="/insumos/stock" className="text-sm text-brand-300 underline">
          Volver al stock
        </Link>
      </div>
    )
  }

  const difference = Math.round((countedQty - currentQty) * 10000) / 10000
  const impact = Math.round(Math.abs(difference) * stock.avg_cost * 100) / 100

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Stock</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{stock.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {stock.group_name} · {stock.category_name ?? 'Sin categoría'}
          </p>
        </div>
        <Link
          to="/insumos/stock"
          className="shrink-0 rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
        >
          Volver
        </Link>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-neutral-500">Existencia actual</p>
            <p className="mt-1 text-3xl font-semibold">
              {formatQty(stock.current_qty_base, stock.base_unit)}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Mínimo {formatQty(stock.min_stock_base, stock.base_unit)}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${statusClasses[stock.stock_status]}`}
          >
            {stockStatusLabels[stock.stock_status]}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-neutral-500">Costo promedio</p>
            <p>
              {formatUnitCost(stock.avg_cost)}
              <span className="ml-1 text-xs text-neutral-500">/{stock.base_unit}</span>
            </p>
          </div>
          <div>
            <p className="text-neutral-500">Valor del stock</p>
            <p>{formatCurrency(stock.stock_value)}</p>
          </div>
          <div>
            <p className="text-neutral-500">Presentación de compra</p>
            <p>
              {stock.purchase_unit} = {formatQty(stock.purchase_factor, stock.base_unit)}
            </p>
          </div>
          <div>
            <p className="text-neutral-500">Tipo</p>
            <p>
              {stock.tier === 'premium'
                ? 'Premium'
                : stock.tier === 'estandar'
                  ? 'Estándar'
                  : 'Sin tier'}
            </p>
          </div>
        </div>
      </section>

      {stock.track_stock && canAdjust ? (
        <form
          className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <div>
            <h2 className="font-semibold">Ajuste por conteo físico</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Captura la existencia contada. El sistema registra la diferencia.
            </p>
          </div>

          {stock.avg_cost === 0 ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              El costo promedio es $0.00. Configúralo en{' '}
              <Link to={`/insumos/${stock.item_id}`} className="underline">
                el insumo
              </Link>{' '}
              para valorizar el stock.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="countedQty" className="mb-1.5 block text-sm text-neutral-300">
                Existencia contada ({stock.base_unit})
              </label>
              <input
                id="countedQty"
                type="number"
                min="0"
                step="0.0001"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...register('countedQty', { valueAsNumber: true })}
              />
              {errors.countedQty ? (
                <p className="mt-1.5 text-sm text-red-400">{errors.countedQty.message}</p>
              ) : null}
            </div>

            <div>
              <p className="mb-1.5 text-sm text-neutral-300">Diferencia</p>
              <p className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-base">
                <span className={difference === 0 ? 'text-neutral-400' : 'text-neutral-100'}>
                  {difference > 0 ? '+' : ''}
                  {formatQty(difference, stock.base_unit)}
                </span>
                <span className="ml-2 text-xs text-neutral-500">{formatCurrency(impact)}</span>
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="adjustNotes" className="mb-1.5 block text-sm text-neutral-300">
              Notas
            </label>
            <textarea
              id="adjustNotes"
              rows={2}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('notes')}
            />
            {errors.notes ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.notes.message}</p>
            ) : null}
          </div>

          {adjustMutation.isError ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {adjustMutation.error.message}
            </p>
          ) : null}

          {adjustMutation.isSuccess ? (
            <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
              Ajuste registrado: {formatQty(adjustMutation.data, stock.base_unit)}.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || difference === 0}
            className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Guardando…' : 'Guardar ajuste'}
          </button>
        </form>
      ) : !canAdjust ? (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
          No tienes permiso para ajustar inventario.
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-semibold">Movimientos</h2>
          <p className="text-xs text-neutral-500">
            {movementsQuery.data?.length ?? 0}{' '}
            {movementsQuery.data?.length === 1 ? 'registro' : 'registros'}
          </p>
        </div>

        {movementsQuery.data?.length === 0 ? (
          <p className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
            Aún no hay movimientos para este insumo.
          </p>
        ) : null}

        {movementsQuery.data?.map((movement) => (
          <article
            key={movement.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-[11px] ${
                    movementClasses[movement.movement_type] ?? movementClasses.transfer
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
                  {formatQty(movement.qty_base, movement.base_unit)}
                </span>
                <span className="block text-[11px] font-normal text-neutral-500">
                  {formatCurrency(movement.total_cost)}
                </span>
              </p>
            </div>

            {movement.purchase_id ? (
              <Link
                to={`/insumos/compras/${movement.purchase_id}`}
                className="mt-2 inline-flex text-xs text-brand-300 underline"
              >
                {movement.purchase_folio}
              </Link>
            ) : null}

            {movement.notes ? (
              <p className="mt-2 text-sm text-neutral-400">{movement.notes}</p>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  )
}
