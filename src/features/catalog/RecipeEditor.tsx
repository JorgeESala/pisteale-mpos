import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { InventoryGroupCost, Product } from '@/types/database'
import { recipeFormSchema, type RecipeForm } from './catalog-schemas'
import {
  fetchDefaultConsumables,
  fetchIceCost7d,
  fetchIceDensity,
  fetchInventoryGroups,
  fetchRecipe,
  fetchRecipeItems,
} from './queries'
import { allowedRecipeUnits, calculateIceGrams, recipeQuantityToBase } from './recipe-units'

function groupUnitCost(
  group: InventoryGroupCost | undefined,
  tierRule: string,
  tier: 'normal' | 'premium',
): number | null {
  if (!group) return null

  if (!group.is_tiered || tierRule === 'any') {
    return group.all_avg_cost
  }

  if (tierRule === 'estandar') {
    return group.standard_avg_cost
  }

  if (tierRule === 'premium') {
    return group.premium_avg_cost
  }

  return tier === 'premium' ? group.premium_avg_cost : group.standard_avg_cost
}

export function RecipeEditor({ product }: { product: Product }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = profile?.role === 'admin'

  const groupsQuery = useQuery({
    queryKey: ['inventory_groups'],
    queryFn: fetchInventoryGroups,
  })

  const defaultsQuery = useQuery({
    queryKey: ['recipe_default_consumables'],
    queryFn: fetchDefaultConsumables,
  })

  const iceDensityQuery = useQuery({
    queryKey: ['ice_density'],
    queryFn: fetchIceDensity,
  })

  const iceCostQuery = useQuery({
    queryKey: ['ice_cost_7d'],
    queryFn: fetchIceCost7d,
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
    setValue,
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
  const defaults = defaultsQuery.data ?? []
  const iceDensity = iceDensityQuery.data ?? 0.9
  const defaultGroupIds = new Set(defaults.map((item) => item.group_id))
  const groups = (groupsQuery.data ?? []).filter((group) => !defaultGroupIds.has(group.group_id))

  useEffect(() => {
    const recipe = recipeQuery.data
    const groupData = groupsQuery.data
    if (!recipe || !groupData) return

    reset({
      yieldQty: Number(recipe.yield_qty),
      yieldUnit: recipe.yield_unit,
      notes: recipe.notes,
      items: (recipeItemsQuery.data ?? []).map((item) => {
        const group = groupData.find((candidate) => candidate.group_id === item.inventory_group_id)
        const fallbackUnit = group?.base_unit ?? 'ml'

        return {
          inventory_group_id: item.inventory_group_id,
          tier_rule: item.tier_rule,
          qty: item.input_qty !== null ? Number(item.input_qty) : Number(item.qty_base),
          unit: item.input_unit ?? fallbackUnit,
        }
      }),
    })
  }, [recipeQuery.data, recipeItemsQuery.data, groupsQuery.data, reset])

  const saveMutation = useMutation({
    mutationFn: async (values: RecipeForm) => {
      const { data, error } = await supabase.rpc('upsert_recipe', {
        p_product_id: product.id,
        p_yield_qty: values.yieldQty,
        p_yield_unit: values.yieldUnit,
        p_notes: values.notes ?? '',
        p_items: values.items.map((item) => ({
          inventory_group_id: item.inventory_group_id,
          tier_rule: item.tier_rule,
          qty: item.qty,
          unit: item.unit,
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

  let normalBatchCost = 0
  let premiumBatchCost = 0
  let normalComplete = watchedItems.length > 0
  let premiumComplete = watchedItems.length > 0

  for (const item of watchedItems) {
    const group = groups.find((candidate) => candidate.group_id === item.inventory_group_id)
    const qtyBase = recipeQuantityToBase(Number(item.qty) || 0, item.unit)
    const normalUnitCost = groupUnitCost(group, item.tier_rule, 'normal')
    const premiumUnitCost = groupUnitCost(group, item.tier_rule, 'premium')

    if (normalUnitCost === null) normalComplete = false
    else normalBatchCost += qtyBase * normalUnitCost

    if (premiumUnitCost === null) premiumComplete = false
    else premiumBatchCost += qtyBase * premiumUnitCost
  }

  let liquidMl = 0
  for (const item of watchedItems) {
    const group = groups.find((candidate) => candidate.group_id === item.inventory_group_id)
    if (group?.base_unit === 'ml') {
      liquidMl += recipeQuantityToBase(Number(item.qty) || 0, item.unit)
    }
  }

  const appliesConsumables = product.kind === 'preparado'
  const iceGrams = appliesConsumables
    ? calculateIceGrams(product.serving_size_ml, liquidMl, iceDensity)
    : 0
  const activeDefaults = defaults.filter((item) => item.active)
  const iceCostPerDrink = iceCostQuery.data?.cost_per_drink ?? null

  let consumablesCost = 0
  let consumablesComplete = !appliesConsumables

  if (appliesConsumables) {
    consumablesComplete = true

    for (const item of activeDefaults) {
      if (item.role === 'ice') {
        if (iceCostPerDrink === null) {
          consumablesComplete = false
          continue
        }

        consumablesCost += iceCostPerDrink
        continue
      }

      if (item.avg_cost === null || (item.qty_base ?? 0) <= 0) {
        consumablesComplete = false
        continue
      }

      consumablesCost += (item.qty_base ?? 0) * item.avg_cost
    }
  }

  const yieldQty = Number(watchedYield) || 1
  const normalRecipeCost = Math.round((normalBatchCost / yieldQty) * 100) / 100
  const premiumRecipeCost = Math.round((premiumBatchCost / yieldQty) * 100) / 100
  const roundedConsumablesCost = Math.round(consumablesCost * 100) / 100
  const normalTotalCost = Math.round((normalRecipeCost + roundedConsumablesCost) * 100) / 100
  const premiumTotalCost = Math.round((premiumRecipeCost + roundedConsumablesCost) * 100) / 100
  const normalTotalComplete = normalComplete && consumablesComplete
  const premiumTotalComplete = premiumComplete && consumablesComplete
  const hasRecipe = (recipeItemsQuery.data?.length ?? 0) > 0 || watchedItems.length > 0

  if (!isAdmin) {
    return null
  }

  if (
    recipeQuery.isLoading ||
    recipeItemsQuery.isLoading ||
    groupsQuery.isLoading ||
    defaultsQuery.isLoading ||
    iceDensityQuery.isLoading ||
    iceCostQuery.isLoading
  ) {
    return <p className="text-sm text-neutral-500">Cargando receta…</p>
  }

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Receta</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Elige el grupo, la regla de tier y la cantidad. Puedes capturar en ml u oz.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${
            hasRecipe
              ? normalTotalComplete && premiumTotalComplete
                ? 'bg-green-500/15 text-green-300'
                : 'bg-yellow-500/15 text-yellow-300'
              : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          {hasRecipe
            ? normalTotalComplete && premiumTotalComplete
              ? 'Completa'
              : 'Costo pendiente'
            : 'Receta pendiente'}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
          No hay grupos de insumos.{' '}
          <Link to="/insumos/grupos/nuevo" className="text-brand-300 underline">
            Crea el primero
          </Link>
          .
        </div>
      ) : null}

      {appliesConsumables ? (
        <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-neutral-200">Incluye automáticamente</p>
            <Link to="/insumos/consumibles" className="text-xs text-brand-300 underline">
              Configurar
            </Link>
          </div>

          {defaultsQuery.isError ? (
            <p className="mt-2 text-red-300">{defaultsQuery.error.message}</p>
          ) : null}

          {iceCostQuery.isError ? (
            <p className="mt-2 text-red-300">{iceCostQuery.error.message}</p>
          ) : null}

          {activeDefaults.length === 0 ? (
            <p className="mt-2 text-amber-300">No hay consumibles configurados.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-neutral-400">
              {activeDefaults.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span>{item.group_name}</span>
                  <span>
                    {item.role === 'ice'
                      ? `${iceGrams} g`
                      : `${item.qty_base ?? 0} ${item.base_unit}`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {activeDefaults.some((item) => item.role === 'ice') ? (
            <p className="mt-2 text-[11px] text-neutral-500">
              Costo de hielo:{' '}
              {iceCostPerDrink === null
                ? 'pendiente de cierre diario.'
                : `${formatCurrency(iceCostPerDrink)} por bebida (promedio 7 días).`}{' '}
              <Link to="/insumos/hielo" className="text-brand-300 underline">
                Registrar cierre
              </Link>
            </p>
          ) : null}

          <p className="mt-2 text-[11px] text-neutral-500">
            Líquido de la receta: {liquidMl} ml · Capacidad del vaso: {product.serving_size_ml} ml
            {liquidMl > product.serving_size_ml
              ? ' · La receta líquida supera la capacidad; el hielo será 0.'
              : ''}
          </p>
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
            const selectedGroup = groups.find(
              (group) => group.group_id === watchedItems[index]?.inventory_group_id,
            )
            const units = selectedGroup ? allowedRecipeUnits(selectedGroup.base_unit) : ['ml']
            const qty = Number(watchedItems[index]?.qty) || 0
            const unit = watchedItems[index]?.unit ?? 'ml'
            const converted = recipeQuantityToBase(qty, unit)

            return (
              <div
                key={field.id}
                className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-2"
              >
                <div className="flex gap-2">
                  <select
                    className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2.5 text-sm text-neutral-100 outline-none focus:border-brand-400"
                    {...register(`items.${index}.inventory_group_id`, {
                      onChange: (event) => {
                        const group = groups.find(
                          (candidate) => candidate.group_id === event.target.value,
                        )
                        if (!group) return
                        setValue(`items.${index}.unit`, allowedRecipeUnits(group.base_unit)[0]!)
                        setValue(`items.${index}.tier_rule`, group.is_tiered ? 'match' : 'any')
                      },
                    })}
                  >
                    <option value="">Grupo…</option>
                    {groups.map((group) => (
                      <option key={group.group_id} value={group.group_id}>
                        {group.name} ({group.base_unit}){group.is_tiered ? ' · tiered' : ''}
                        {group.active ? '' : ' · inactivo'}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="min-h-10 shrink-0 rounded-lg border border-neutral-700 px-2 text-xs text-neutral-400 transition hover:border-red-500/50 hover:text-red-300"
                  >
                    Quitar
                  </button>
                </div>

                <div className="grid grid-cols-[1fr_5.5rem_4.5rem] gap-2">
                  {selectedGroup?.is_tiered ? (
                    <select
                      className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2.5 text-sm text-neutral-100 outline-none focus:border-brand-400"
                      {...register(`items.${index}.tier_rule`)}
                    >
                      <option value="match">Igual que la bebida</option>
                      <option value="any">Cualquier tier</option>
                      <option value="estandar">Estándar</option>
                      <option value="premium">Premium</option>
                    </select>
                  ) : (
                    <input type="hidden" {...register(`items.${index}.tier_rule`)} />
                  )}

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2.5 text-sm text-neutral-100 outline-none focus:border-brand-400"
                    {...register(`items.${index}.qty`, { valueAsNumber: true })}
                  />

                  <select
                    className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2.5 text-sm text-neutral-100 outline-none focus:border-brand-400"
                    {...register(`items.${index}.unit`)}
                  >
                    {units.map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {candidate}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="text-[11px] text-neutral-500">
                  {selectedGroup
                    ? `${qty} ${unit} = ${converted} ${selectedGroup.base_unit}`
                    : 'Selecciona un grupo'}
                </p>

                {errors.items?.[index]?.inventory_group_id ? (
                  <p className="text-xs text-red-400">
                    {errors.items[index]?.inventory_group_id?.message}
                  </p>
                ) : null}
                {errors.items?.[index]?.qty ? (
                  <p className="text-xs text-red-400">{errors.items[index]?.qty?.message}</p>
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
          onClick={() =>
            append({
              inventory_group_id: '',
              tier_rule: 'any',
              qty: 1,
              unit: 'ml',
            })
          }
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
                <dt>Costo receta normal</dt>
                <dd>{normalComplete ? formatCurrency(normalRecipeCost) : '—'}</dd>
              </div>
              {appliesConsumables ? (
                <div className="flex justify-between gap-3">
                  <dt>Consumibles</dt>
                  <dd>{consumablesComplete ? formatCurrency(roundedConsumablesCost) : '—'}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 font-medium text-neutral-200">
                <dt>Costo total normal</dt>
                <dd>{normalTotalComplete ? formatCurrency(normalTotalCost) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Margen normal</dt>
                <dd>
                  {normalTotalComplete ? formatCurrency(product.price - normalTotalCost) : '—'}
                </dd>
              </div>
              {product.premium_price !== null ? (
                <>
                  <div className="flex justify-between gap-3 pt-2">
                    <dt>Costo receta premium</dt>
                    <dd>{premiumComplete ? formatCurrency(premiumRecipeCost) : '—'}</dd>
                  </div>
                  {appliesConsumables ? (
                    <div className="flex justify-between gap-3">
                      <dt>Consumibles</dt>
                      <dd>{consumablesComplete ? formatCurrency(roundedConsumablesCost) : '—'}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 font-medium text-neutral-200">
                    <dt>Costo total premium</dt>
                    <dd>{premiumTotalComplete ? formatCurrency(premiumTotalCost) : '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Margen premium</dt>
                    <dd>
                      {premiumTotalComplete
                        ? formatCurrency(product.premium_price - premiumTotalCost)
                        : '—'}
                    </dd>
                  </div>
                </>
              ) : null}
              {!normalTotalComplete || (product.premium_price !== null && !premiumTotalComplete) ? (
                <p className="pt-1 text-yellow-300">
                  Hay grupos sin costo, marcas del tier o consumibles sin costo. El margen es
                  estimado hasta capturarlos.
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
