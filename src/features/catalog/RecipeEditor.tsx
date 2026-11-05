import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/types/database'
import { recipeFormSchema, type RecipeForm } from './catalog-schemas'
import { fetchInventoryItems, fetchRecipe, fetchRecipeItems } from './queries'

export function RecipeEditor({ product }: { product: Product }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = profile?.role === 'admin'

  const inventoryItemsQuery = useQuery({
    queryKey: ['inventory_items'],
    queryFn: fetchInventoryItems,
  })

  const recipeQuery = useQuery({
    queryKey: ['recipe', product.id],
    queryFn: () => fetchRecipe(product.id),
  })

  const recipeItemsQuery = useQuery({
    queryKey: ['recipe_items', recipeQuery.data?.id],
    queryFn: () => fetchRecipeItems(recipeQuery.data!.id),
    enabled: Boolean(recipeQuery.data?.id),
  })

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecipeForm>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: {
      yieldQty: 1,
      yieldUnit: 'porcion',
      notes: '',
      items: [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const watchedItems = useWatch({ control, name: 'items' }) ?? []
  const watchedYield = useWatch({ control, name: 'yieldQty' })
  const inventoryItems = inventoryItemsQuery.data ?? []

  useEffect(() => {
    const recipe = recipeQuery.data
    if (!recipe) return

    reset({
      yieldQty: Number(recipe.yield_qty),
      yieldUnit: recipe.yield_unit,
      notes: recipe.notes,
      items: (recipeItemsQuery.data ?? []).map((item) => ({
        inventory_item_id: item.inventory_item_id,
        qty_base: item.qty_base,
      })),
    })
  }, [recipeQuery.data, recipeItemsQuery.data, reset])

  const saveMutation = useMutation({
    mutationFn: async (values: RecipeForm) => {
      const { data, error } = await supabase.rpc('upsert_recipe', {
        p_product_id: product.id,
        p_yield_qty: values.yieldQty,
        p_yield_unit: values.yieldUnit,
        p_notes: values.notes ?? '',
        p_items: values.items.map((item) => ({
          inventory_item_id: item.inventory_item_id,
          qty_base: item.qty_base,
        })),
      })

      if (error) throw error

      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['product', product.id] })
      void queryClient.invalidateQueries({ queryKey: ['recipe', product.id] })
      void queryClient.invalidateQueries({ queryKey: ['recipe_items', recipeQuery.data?.id] })
    },
  })

  async function onSubmit(values: RecipeForm) {
    await saveMutation.mutateAsync(values)
  }

  const totalBatchCost = watchedItems.reduce((sum, item) => {
    const inventoryItem = inventoryItems.find(
      (candidate) => candidate.id === item.inventory_item_id,
    )
    return sum + (inventoryItem ? inventoryItem.avg_cost * Number(item.qty_base || 0) : 0)
  }, 0)
  const costPerServing = totalBatchCost / (Number(watchedYield) || 1)
  const costComplete =
    watchedItems.length > 0 &&
    watchedItems.every((item) => {
      const inventoryItem = inventoryItems.find(
        (candidate) => candidate.id === item.inventory_item_id,
      )
      return inventoryItem ? inventoryItem.avg_cost > 0 : false
    })
  const hasRecipe = (recipeItemsQuery.data?.length ?? 0) > 0 || watchedItems.length > 0

  if (!isAdmin) {
    return null
  }

  if (recipeQuery.isLoading || recipeItemsQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando receta…</p>
  }

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Receta</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Las cantidades se capturan en la unidad base del insumo: ml, g o pza.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${
            hasRecipe
              ? costComplete
                ? 'bg-green-500/15 text-green-300'
                : 'bg-yellow-500/15 text-yellow-300'
              : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          {hasRecipe ? (costComplete ? 'Completa' : 'Costo pendiente') : 'Receta pendiente'}
        </span>
      </div>

      {inventoryItems.length === 0 ? (
        <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
          No hay insumos registrados.{' '}
          <Link to="/insumos/nuevo" className="text-brand-300 underline">
            Crea el primero
          </Link>
          .
        </div>
      ) : null}

      <form className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="yieldQty" className="mb-1.5 block text-sm text-neutral-300">
              Porciones
            </label>
            <input
              id="yieldQty"
              type="number"
              min="0.001"
              step="0.001"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('yieldQty', { valueAsNumber: true })}
            />
            {errors.yieldQty ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.yieldQty.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="yieldUnit" className="mb-1.5 block text-sm text-neutral-300">
              Unidad
            </label>
            <input
              id="yieldUnit"
              type="text"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('yieldUnit')}
            />
            {errors.yieldUnit ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.yieldUnit.message}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => {
            const selectedItem = inventoryItems.find(
              (item) => item.id === watchedItems[index]?.inventory_item_id,
            )

            return (
              <div
                key={field.id}
                className="rounded-xl border border-neutral-800 bg-neutral-950 p-2"
              >
                <div className="grid grid-cols-[1fr_5.5rem_auto] items-start gap-2">
                  <div>
                    <select
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2.5 text-sm text-neutral-100 outline-none focus:border-brand-400"
                      {...register(`items.${index}.inventory_item_id`)}
                    >
                      <option value="">Insumo…</option>
                      {inventoryItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.base_unit}){item.active ? '' : ' · inactivo'}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      {selectedItem ? selectedItem.base_unit : 'Selecciona un insumo'}
                    </p>
                  </div>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2.5 text-sm text-neutral-100 outline-none focus:border-brand-400"
                    {...register(`items.${index}.qty_base`, { valueAsNumber: true })}
                  />

                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="min-h-10 rounded-lg border border-neutral-700 px-2 text-xs text-neutral-400 transition hover:border-red-500/50 hover:text-red-300"
                  >
                    Quitar
                  </button>
                </div>

                {errors.items?.[index]?.inventory_item_id ? (
                  <p className="mt-1 text-xs text-red-400">
                    {errors.items[index]?.inventory_item_id?.message}
                  </p>
                ) : null}
                {errors.items?.[index]?.qty_base ? (
                  <p className="mt-1 text-xs text-red-400">
                    {errors.items[index]?.qty_base?.message}
                  </p>
                ) : null}
              </div>
            )
          })}
          {errors.items?.root?.message ? (
            <p className="text-sm text-red-400">{errors.items.root.message}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => append({ inventory_item_id: '', qty_base: 1 })}
          className="w-full rounded-xl border border-dashed border-neutral-700 px-3 py-2.5 text-sm text-neutral-300 transition hover:border-brand-400"
        >
          Agregar insumo
        </button>

        <div>
          <label htmlFor="recipeNotes" className="mb-1.5 block text-sm text-neutral-300">
            Notas de la receta
          </label>
          <textarea
            id="recipeNotes"
            rows={2}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            {...register('notes')}
          />
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm">
          {!hasRecipe ? (
            <p className="text-amber-300">Agrega insumos y cantidades para completar la receta.</p>
          ) : (
            <dl className="space-y-1 text-neutral-400">
              <div className="flex justify-between gap-3">
                <dt>Costo del lote</dt>
                <dd>{formatCurrency(totalBatchCost)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Costo por porción</dt>
                <dd>{formatCurrency(costPerServing)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Margen estimado</dt>
                <dd>{formatCurrency(product.price - costPerServing)}</dd>
              </div>
              {!costComplete ? (
                <p className="pt-1 text-yellow-300">
                  Hay insumos sin costo. El margen es estimado hasta capturarlos.
                </p>
              ) : null}
            </dl>
          )}
        </div>

        {saveMutation.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {saveMutation.error.message}
          </p>
        ) : null}

        {saveMutation.isSuccess ? (
          <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
            Receta guardada.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Guardando…' : 'Guardar receta'}
        </button>
      </form>
    </section>
  )
}
