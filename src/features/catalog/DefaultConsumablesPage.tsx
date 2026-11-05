import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { defaultConsumablesFormSchema, type DefaultConsumablesForm } from './catalog-schemas'
import {
  fetchDefaultConsumables,
  fetchIceCost7d,
  fetchIceDensity,
  fetchInventoryGroups,
} from './queries'

export function DefaultConsumablesPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = profile?.role === 'admin'

  const defaultsQuery = useQuery({
    queryKey: ['recipe_default_consumables'],
    queryFn: fetchDefaultConsumables,
  })

  const groupsQuery = useQuery({
    queryKey: ['inventory_groups'],
    queryFn: fetchInventoryGroups,
  })

  const densityQuery = useQuery({
    queryKey: ['ice_density'],
    queryFn: fetchIceDensity,
  })

  const iceCostQuery = useQuery({
    queryKey: ['ice_cost_7d'],
    queryFn: fetchIceCost7d,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DefaultConsumablesForm>({
    resolver: zodResolver(defaultConsumablesFormSchema),
    defaultValues: {
      iceGroupId: '',
      cupGroupId: '',
      lidGroupId: '',
      strawGroupId: '',
      cupQty: 1,
      lidQty: 1,
      strawQty: 1,
      iceDensity: 0.9,
      iceActive: true,
      cupActive: true,
      lidActive: true,
      strawActive: true,
    },
  })

  useEffect(() => {
    const defaults = defaultsQuery.data
    if (!defaults || densityQuery.data === undefined) return

    const byRole = new Map(defaults.map((item) => [item.role, item]))

    reset({
      iceGroupId: byRole.get('ice')?.group_id ?? '',
      cupGroupId: byRole.get('cup')?.group_id ?? '',
      lidGroupId: byRole.get('lid')?.group_id ?? '',
      strawGroupId: byRole.get('straw')?.group_id ?? '',
      cupQty: byRole.get('cup')?.qty_base ?? 1,
      lidQty: byRole.get('lid')?.qty_base ?? 1,
      strawQty: byRole.get('straw')?.qty_base ?? 1,
      iceDensity: densityQuery.data,
      iceActive: byRole.get('ice')?.active ?? true,
      cupActive: byRole.get('cup')?.active ?? true,
      lidActive: byRole.get('lid')?.active ?? true,
      strawActive: byRole.get('straw')?.active ?? true,
    })
  }, [defaultsQuery.data, densityQuery.data, reset])

  const saveMutation = useMutation({
    mutationFn: async (values: DefaultConsumablesForm) => {
      const { error } = await supabase.rpc('save_recipe_default_consumables', {
        p_items: [
          {
            role: 'ice',
            inventory_group_id: values.iceGroupId,
            qty_base: null,
            active: values.iceActive,
          },
          {
            role: 'cup',
            inventory_group_id: values.cupGroupId,
            qty_base: values.cupQty,
            active: values.cupActive,
          },
          {
            role: 'lid',
            inventory_group_id: values.lidGroupId,
            qty_base: values.lidQty,
            active: values.lidActive,
          },
          {
            role: 'straw',
            inventory_group_id: values.strawGroupId,
            qty_base: values.strawQty,
            active: values.strawActive,
          },
        ],
        p_ice_density: values.iceDensity,
      })

      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipe_default_consumables'] })
      void queryClient.invalidateQueries({ queryKey: ['ice_density'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  async function onSubmit(values: DefaultConsumablesForm) {
    await saveMutation.mutateAsync(values)
  }

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
        <h1 className="font-semibold">Acceso restringido</h1>
        <p className="mt-1 text-sm">Solo administradores pueden editar los consumibles.</p>
        <Link to="/insumos" className="mt-4 inline-flex text-sm text-amber-100 underline">
          Volver a insumos
        </Link>
      </section>
    )
  }

  if (
    defaultsQuery.isLoading ||
    groupsQuery.isLoading ||
    densityQuery.isLoading ||
    iceCostQuery.isLoading
  ) {
    return <p className="text-sm text-neutral-500">Cargando consumibles…</p>
  }

  if (
    defaultsQuery.isError ||
    groupsQuery.isError ||
    densityQuery.isError ||
    iceCostQuery.isError
  ) {
    const error =
      defaultsQuery.error ?? groupsQuery.error ?? densityQuery.error ?? iceCostQuery.error
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error?.message}
      </p>
    )
  }

  const groups = groupsQuery.data ?? []
  const gramGroups = groups.filter(
    (group) => group.base_unit === 'g' && group.name.toLocaleLowerCase('es-MX').includes('hielo'),
  )
  const pieceGroups = groups.filter(
    (group) => group.base_unit === 'pza' && group.category_name === 'Consumibles',
  )

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Catálogo</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Consumibles automáticos</h1>
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
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
          Todas las bebidas preparadas incluyen automáticamente hielo, vaso, tapa y popote. El hielo
          se calcula con la capacidad del vaso menos el líquido de la receta; los gramos son solo
          referencia. El costo del hielo se toma del promedio de los últimos 7 cierres diarios.
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-neutral-200">Hielo del día</p>
              <p className="mt-1 text-sm text-neutral-400">
                {iceCostQuery.data?.cost_per_drink !== null &&
                iceCostQuery.data?.cost_per_drink !== undefined
                  ? `Costo promedio 7 días: ${formatCurrency(iceCostQuery.data.cost_per_drink)} por bebida`
                  : 'Sin cierres diarios: el costo de hielo queda pendiente.'}
              </p>
              {iceCostQuery.data && iceCostQuery.data.days_count > 0 ? (
                <p className="mt-1 text-[11px] text-neutral-500">
                  {iceCostQuery.data.days_count}{' '}
                  {iceCostQuery.data.days_count === 1
                    ? 'cierre considerado'
                    : 'cierres considerados'}
                  .
                </p>
              ) : null}
            </div>
            <Link
              to="/insumos/hielo"
              className="shrink-0 rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
            >
              Hielo del día
            </Link>
          </div>
        </div>

        <div>
          <label htmlFor="iceGroupId" className="mb-1.5 block text-sm text-neutral-300">
            Grupo de hielo
          </label>
          <select
            id="iceGroupId"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            {...register('iceGroupId')}
          >
            <option value="">Selecciona un grupo</option>
            {gramGroups.map((group) => (
              <option key={group.group_id} value={group.group_id}>
                {group.name}
              </option>
            ))}
          </select>
          {errors.iceGroupId ? (
            <p className="mt-1.5 text-sm text-red-400">{errors.iceGroupId.message}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cupGroupId" className="mb-1.5 block text-sm text-neutral-300">
              Grupo de vaso
            </label>
            <select
              id="cupGroupId"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('cupGroupId')}
            >
              <option value="">Selecciona un grupo</option>
              {pieceGroups.map((group) => (
                <option key={group.group_id} value={group.group_id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="cupQty" className="mb-1.5 block text-sm text-neutral-300">
              Vasos por bebida
            </label>
            <input
              id="cupQty"
              type="number"
              min="1"
              step="1"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('cupQty', { valueAsNumber: true })}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            className="size-4 rounded border-neutral-600 bg-neutral-950"
            {...register('cupActive')}
          />
          Incluir vaso
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="lidGroupId" className="mb-1.5 block text-sm text-neutral-300">
              Grupo de tapa
            </label>
            <select
              id="lidGroupId"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('lidGroupId')}
            >
              <option value="">Selecciona un grupo</option>
              {pieceGroups.map((group) => (
                <option key={group.group_id} value={group.group_id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="lidQty" className="mb-1.5 block text-sm text-neutral-300">
              Tapas por bebida
            </label>
            <input
              id="lidQty"
              type="number"
              min="1"
              step="1"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('lidQty', { valueAsNumber: true })}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            className="size-4 rounded border-neutral-600 bg-neutral-950"
            {...register('lidActive')}
          />
          Incluir tapa
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="strawGroupId" className="mb-1.5 block text-sm text-neutral-300">
              Grupo de popote
            </label>
            <select
              id="strawGroupId"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('strawGroupId')}
            >
              <option value="">Selecciona un grupo</option>
              {pieceGroups.map((group) => (
                <option key={group.group_id} value={group.group_id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="strawQty" className="mb-1.5 block text-sm text-neutral-300">
              Popotes por bebida
            </label>
            <input
              id="strawQty"
              type="number"
              min="1"
              step="1"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('strawQty', { valueAsNumber: true })}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            className="size-4 rounded border-neutral-600 bg-neutral-950"
            {...register('strawActive')}
          />
          Incluir popote
        </label>

        <div>
          <label htmlFor="iceDensity" className="mb-1.5 block text-sm text-neutral-300">
            Densidad del hielo (referencia, g/ml)
          </label>
          <input
            id="iceDensity"
            type="number"
            min="0.0001"
            step="0.0001"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            {...register('iceDensity', { valueAsNumber: true })}
          />
          {errors.iceDensity ? (
            <p className="mt-1.5 text-sm text-red-400">{errors.iceDensity.message}</p>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            className="size-4 rounded border-neutral-600 bg-neutral-950"
            {...register('iceActive')}
          />
          Incluir hielo
        </label>

        {saveMutation.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {saveMutation.error.message}
          </p>
        ) : null}

        {saveMutation.isSuccess ? (
          <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
            Consumibles guardados.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Guardando…' : 'Guardar consumibles'}
        </button>
      </form>
    </div>
  )
}
