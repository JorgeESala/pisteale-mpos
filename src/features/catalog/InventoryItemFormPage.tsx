import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'
import { inventoryItemFormSchema, type InventoryItemForm } from './catalog-schemas'
import { fetchInventoryCategories, fetchInventoryItem } from './queries'

export function InventoryItemFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const isNew = id === 'nuevo'
  const itemId = isNew ? undefined : id
  const isAdmin = profile?.role === 'admin'

  const itemQuery = useQuery({
    queryKey: ['inventory_item', itemId],
    queryFn: () => fetchInventoryItem(itemId!),
    enabled: Boolean(itemId),
  })

  const categoriesQuery = useQuery({
    queryKey: ['inventory_categories'],
    queryFn: fetchInventoryCategories,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InventoryItemForm>({
    resolver: zodResolver(inventoryItemFormSchema),
    defaultValues: {
      name: '',
      categoryId: '',
      kind: 'ingrediente',
      baseUnit: 'ml',
      purchaseUnit: 'botella',
      purchaseFactor: 750,
      avgCost: 0,
      minStockBase: 0,
      trackStock: true,
      active: true,
    },
  })

  useEffect(() => {
    const item = itemQuery.data
    if (!item) return

    reset({
      name: item.name,
      categoryId: item.category_id ?? '',
      kind: item.kind,
      baseUnit: item.base_unit,
      purchaseUnit: item.purchase_unit,
      purchaseFactor: item.purchase_factor,
      avgCost: item.avg_cost,
      minStockBase: item.min_stock_base,
      trackStock: item.track_stock,
      active: item.active,
    })
  }, [itemQuery.data, reset])

  const saveMutation = useMutation({
    mutationFn: async (values: InventoryItemForm) => {
      const targetId = isNew ? crypto.randomUUID() : itemId!

      const { data, error } = await supabase.rpc('upsert_inventory_item', {
        p_id: targetId,
        p_name: values.name,
        p_category_id: values.categoryId || null,
        p_kind: values.kind,
        p_base_unit: values.baseUnit,
        p_purchase_unit: values.purchaseUnit,
        p_purchase_factor: values.purchaseFactor,
        p_avg_cost: values.avgCost,
        p_min_stock_base: values.minStockBase,
        p_track_stock: values.trackStock,
        p_active: values.active,
      })

      if (error) throw error

      return { item: data, created: isNew }
    },
    onSuccess: ({ item, created }) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory_items'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_item', item.id] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })

      if (created) {
        navigate('/insumos', { replace: true })
      }
    },
  })

  async function onSubmit(values: InventoryItemForm) {
    await saveMutation.mutateAsync(values)
  }

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
        <h1 className="font-semibold">Acceso restringido</h1>
        <p className="mt-1 text-sm">Solo administradores pueden editar insumos.</p>
        <Link to="/insumos" className="mt-4 inline-flex text-sm text-amber-100 underline">
          Volver a insumos
        </Link>
      </section>
    )
  }

  if (itemQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando insumo…</p>
  }

  if (itemQuery.isError) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {itemQuery.error.message}
      </p>
    )
  }

  if (!isNew && !itemQuery.data) {
    return (
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h1 className="font-semibold">Insumo no encontrado</h1>
        <Link to="/insumos" className="mt-4 inline-flex text-sm text-neutral-300 underline">
          Volver a insumos
        </Link>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Catálogo</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {isNew ? 'Nuevo insumo' : itemQuery.data?.name}
          </h1>
        </div>
        <Link
          to="/insumos"
          className="shrink-0 rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
        >
          Volver
        </Link>
      </section>

      <form
        className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm text-neutral-300">
            Nombre
          </label>
          <input
            id="name"
            type="text"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            {...register('name')}
          />
          {errors.name ? (
            <p className="mt-1.5 text-sm text-red-400">{errors.name.message}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="categoryId" className="mb-1.5 block text-sm text-neutral-300">
              Categoría
            </label>
            <select
              id="categoryId"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('categoryId')}
            >
              <option value="">Sin categoría</option>
              {categoriesQuery.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="kind" className="mb-1.5 block text-sm text-neutral-300">
              Tipo
            </label>
            <select
              id="kind"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('kind')}
            >
              <option value="ingrediente">Ingrediente</option>
              <option value="consumible">Consumible</option>
              <option value="botella">Botella</option>
              <option value="preparacion">Preparación</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="baseUnit" className="mb-1.5 block text-sm text-neutral-300">
              Unidad base
            </label>
            <select
              id="baseUnit"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('baseUnit')}
            >
              <option value="ml">ml</option>
              <option value="g">g</option>
              <option value="pza">pza</option>
            </select>
          </div>

          <div>
            <label htmlFor="purchaseUnit" className="mb-1.5 block text-sm text-neutral-300">
              Unidad de compra
            </label>
            <input
              id="purchaseUnit"
              type="text"
              placeholder="botella, caja, kg…"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('purchaseUnit')}
            />
            {errors.purchaseUnit ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.purchaseUnit.message}</p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="purchaseFactor" className="mb-1.5 block text-sm text-neutral-300">
              Base por compra
            </label>
            <input
              id="purchaseFactor"
              type="number"
              min="0.0001"
              step="0.0001"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('purchaseFactor', { valueAsNumber: true })}
            />
            <p className="mt-1 text-[11px] text-neutral-500">Ej. botella de 750 ml = 750 ml.</p>
            {errors.purchaseFactor ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.purchaseFactor.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="avgCost" className="mb-1.5 block text-sm text-neutral-300">
              Costo por unidad base
            </label>
            <input
              id="avgCost"
              type="number"
              min="0"
              step="0.0001"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('avgCost', { valueAsNumber: true })}
            />
            {errors.avgCost ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.avgCost.message}</p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="minStockBase" className="mb-1.5 block text-sm text-neutral-300">
              Stock mínimo
            </label>
            <input
              id="minStockBase"
              type="number"
              min="0"
              step="1"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('minStockBase', { valueAsNumber: true })}
            />
            {errors.minStockBase ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.minStockBase.message}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              className="size-4 rounded border-neutral-600 bg-neutral-950"
              {...register('trackStock')}
            />
            Controlar stock
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              className="size-4 rounded border-neutral-600 bg-neutral-950"
              {...register('active')}
            />
            Activo
          </label>
        </div>

        {saveMutation.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {saveMutation.error.message}
          </p>
        ) : null}

        {saveMutation.isSuccess && !isNew ? (
          <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
            Insumo guardado.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Guardando…' : 'Guardar insumo'}
        </button>
      </form>
    </div>
  )
}
