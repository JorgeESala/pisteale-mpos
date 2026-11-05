import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { fetchInventoryItems } from '@/features/catalog/queries'
import { formatCurrency, formatUnitCost } from '@/lib/format'
import { purchaseFormSchema, type PurchaseForm } from './inventory-schemas'
import { createPurchase, fetchPurchases } from './queries'
import { formatDate, formatQty } from './inventory-utils'

function todayIso() {
  return new Date().toLocaleDateString('en-CA')
}

export function PurchasesPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const canAdjust = profile?.role === 'admin' || profile?.can_adjust_inventory === true

  const purchasesQuery = useQuery({
    queryKey: ['purchases'],
    queryFn: () => fetchPurchases(50),
  })

  const itemsQuery = useQuery({
    queryKey: ['inventory_items'],
    queryFn: fetchInventoryItems,
  })

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseForm>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: {
      purchaseDate: todayIso(),
      supplier: '',
      invoiceRef: '',
      notes: '',
      items: [{ itemId: '', qtyPurchase: 1, totalCost: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const watchedItems = useWatch({ control, name: 'items' }) ?? []
  const stockableItems = (itemsQuery.data ?? [])
    .filter((item) => item.track_stock && item.active)
    .sort((a, b) => a.name.localeCompare(b.name))
  const itemById = new Map(stockableItems.map((item) => [item.id, item]))
  const total = watchedItems.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0)

  const createMutation = useMutation({
    mutationFn: (values: PurchaseForm) =>
      createPurchase({
        purchaseDate: values.purchaseDate,
        supplier: values.supplier,
        invoiceRef: values.invoiceRef,
        notes: values.notes ?? '',
        items: values.items.map((item) => ({
          itemId: item.itemId,
          qtyPurchase: item.qtyPurchase,
          totalCost: item.totalCost,
        })),
      }),
    onSuccess: (purchaseId) => {
      void queryClient.invalidateQueries({ queryKey: ['purchases'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_stock'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_stock_item'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_movements'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_items'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_groups'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      navigate(`/insumos/compras/${purchaseId}`)
    },
  })

  async function onSubmit(values: PurchaseForm) {
    await createMutation.mutateAsync(values)
  }

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Insumos</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Compras</h1>
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
        </div>
      </section>

      {canAdjust ? (
        <form
          className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <div>
            <h2 className="font-semibold">Registrar compra</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Captura la cantidad comprada y el costo total de cada línea.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="purchaseDate" className="mb-1.5 block text-sm text-neutral-300">
                Fecha
              </label>
              <input
                id="purchaseDate"
                type="date"
                max={todayIso()}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...register('purchaseDate')}
              />
              {errors.purchaseDate ? (
                <p className="mt-1.5 text-sm text-red-400">{errors.purchaseDate.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="supplier" className="mb-1.5 block text-sm text-neutral-300">
                Proveedor
              </label>
              <input
                id="supplier"
                type="text"
                placeholder="Opcional"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                {...register('supplier')}
              />
              {errors.supplier ? (
                <p className="mt-1.5 text-sm text-red-400">{errors.supplier.message}</p>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor="invoiceRef" className="mb-1.5 block text-sm text-neutral-300">
              Factura o referencia
            </label>
            <input
              id="invoiceRef"
              type="text"
              placeholder="Opcional"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('invoiceRef')}
            />
            {errors.invoiceRef ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.invoiceRef.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="purchaseNotes" className="mb-1.5 block text-sm text-neutral-300">
              Notas
            </label>
            <textarea
              id="purchaseNotes"
              rows={2}
              placeholder="Opcional"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('notes')}
            />
            {errors.notes ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.notes.message}</p>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-neutral-200">Insumos</h3>
              <button
                type="button"
                onClick={() => append({ itemId: '', qtyPurchase: 1, totalCost: 0 })}
                className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
              >
                Agregar línea
              </button>
            </div>

            {fields.map((field, index) => {
              const watched = watchedItems[index]
              const item = watched ? itemById.get(watched.itemId) : undefined
              const qtyPurchase = Number(watched?.qtyPurchase) || 0
              const totalCost = Number(watched?.totalCost) || 0
              const qtyBase = item ? qtyPurchase * item.purchase_factor : 0
              const unitCostBase = qtyBase > 0 ? totalCost / qtyBase : 0
              const unitCostPurchase = qtyPurchase > 0 ? totalCost / qtyPurchase : 0

              return (
                <div
                  key={field.id}
                  className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                >
                  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <div>
                      <label
                        htmlFor={`items.${index}.itemId`}
                        className="mb-1.5 block text-xs text-neutral-400"
                      >
                        Insumo
                      </label>
                      <select
                        id={`items.${index}.itemId`}
                        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                        {...register(`items.${index}.itemId`)}
                      >
                        <option value="">Selecciona un insumo</option>
                        {stockableItems.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name} ({option.group_name}) · {option.purchase_unit} ={' '}
                            {formatQty(option.purchase_factor, option.base_unit)}
                          </option>
                        ))}
                      </select>
                      {errors.items?.[index]?.itemId ? (
                        <p className="mt-1.5 text-sm text-red-400">
                          {errors.items[index]?.itemId?.message}
                        </p>
                      ) : null}
                    </div>

                    {fields.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="rounded-xl border border-red-500/40 px-3 py-3 text-sm text-red-300 transition hover:border-red-400"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor={`items.${index}.qtyPurchase`}
                        className="mb-1.5 block text-xs text-neutral-400"
                      >
                        Cantidad ({item?.purchase_unit ?? 'compra'})
                      </label>
                      <input
                        id={`items.${index}.qtyPurchase`}
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                        {...register(`items.${index}.qtyPurchase`, { valueAsNumber: true })}
                      />
                      {errors.items?.[index]?.qtyPurchase ? (
                        <p className="mt-1.5 text-sm text-red-400">
                          {errors.items[index]?.qtyPurchase?.message}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label
                        htmlFor={`items.${index}.totalCost`}
                        className="mb-1.5 block text-xs text-neutral-400"
                      >
                        Costo total de la línea
                      </label>
                      <input
                        id={`items.${index}.totalCost`}
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
                        {...register(`items.${index}.totalCost`, { valueAsNumber: true })}
                      />
                      {errors.items?.[index]?.totalCost ? (
                        <p className="mt-1.5 text-sm text-red-400">
                          {errors.items[index]?.totalCost?.message}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {item ? (
                    <p className="text-[11px] text-neutral-500">
                      {formatQty(qtyBase, item.base_unit)} · costo por {item.purchase_unit}:{' '}
                      {formatCurrency(unitCostPurchase)} · costo por {item.base_unit}:{' '}
                      {formatUnitCost(unitCostBase)}
                    </p>
                  ) : null}
                </div>
              )
            })}

            {errors.items?.message ? (
              <p className="text-sm text-red-400">{errors.items.message}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
            <p className="text-sm text-neutral-400">Total de la compra</p>
            <p className="text-lg font-semibold">{formatCurrency(total)}</p>
          </div>

          {createMutation.isError ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {createMutation.error.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Guardando compra…' : 'Guardar compra'}
          </button>
        </form>
      ) : (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
          <p className="text-sm">
            Tu usuario no tiene permiso para registrar compras o ajustar inventario.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-semibold">Compras recientes</h2>
          <p className="text-xs text-neutral-500">{purchasesQuery.data?.length ?? 0} compras</p>
        </div>

        {purchasesQuery.isLoading ? (
          <p className="text-sm text-neutral-500">Cargando compras…</p>
        ) : null}

        {purchasesQuery.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {purchasesQuery.error.message}
          </p>
        ) : null}

        {purchasesQuery.data?.map((purchase) => (
          <Link
            key={purchase.id}
            to={`/insumos/compras/${purchase.id}`}
            className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-600"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{purchase.folio}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {formatDate(purchase.purchase_date)}
                  {purchase.supplier ? ` · ${purchase.supplier}` : ''} · {purchase.item_count}{' '}
                  {purchase.item_count === 1 ? 'insumo' : 'insumos'}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold">
                {formatCurrency(purchase.total_cost)}
              </p>
            </div>
          </Link>
        ))}

        {purchasesQuery.data?.length === 0 ? (
          <p className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
            Aún no hay compras registradas.
          </p>
        ) : null}
      </section>
    </div>
  )
}
