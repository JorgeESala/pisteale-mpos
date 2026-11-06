import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'
import { inventoryGroupFormSchema, type InventoryGroupForm } from './catalog-schemas'
import { fetchInventoryCategories, fetchInventoryGroup } from './queries'

export function GroupFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const isNew = id === 'nuevo'
  const groupId = isNew ? undefined : id
  const canManageCatalog = profile?.role === 'admin' || profile?.can_manage_catalog === true

  const groupQuery = useQuery({
    queryKey: ['inventory_group', groupId],
    queryFn: () => fetchInventoryGroup(groupId!),
    enabled: Boolean(groupId),
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
  } = useForm<InventoryGroupForm>({
    resolver: zodResolver(inventoryGroupFormSchema),
    defaultValues: {
      name: '',
      categoryId: '',
      baseUnit: 'ml',
      isTiered: true,
      active: true,
    },
  })

  useEffect(() => {
    const group = groupQuery.data
    if (!group || !categoriesQuery.data) return

    reset({
      name: group.name,
      categoryId: group.category_id ?? '',
      baseUnit: group.base_unit,
      isTiered: group.is_tiered,
      active: group.active,
    })
  }, [groupQuery.data, categoriesQuery.data, reset])

  const saveMutation = useMutation({
    mutationFn: async (values: InventoryGroupForm) => {
      const targetId = isNew ? crypto.randomUUID() : groupId!

      const { data, error } = await supabase.rpc('upsert_inventory_group', {
        p_id: targetId,
        p_name: values.name,
        p_category_id: values.categoryId || null,
        p_base_unit: values.baseUnit,
        p_is_tiered: values.isTiered,
        p_active: values.active,
      })

      if (error) throw error

      return { group: data, created: isNew }
    },
    onSuccess: ({ group, created }) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory_groups'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_group', group.id] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_items'] })

      if (created) {
        navigate('/insumos/grupos', { replace: true })
      }
    },
  })

  async function onSubmit(values: InventoryGroupForm) {
    await saveMutation.mutateAsync(values)
  }

  if (!canManageCatalog) {
    return (
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
        <h1 className="font-semibold">Acceso restringido</h1>
        <p className="mt-1 text-sm">Solo administradores pueden editar grupos.</p>
        <Link to="/insumos/grupos" className="mt-4 inline-flex text-sm text-amber-100 underline">
          Volver a grupos
        </Link>
      </section>
    )
  }

  if (groupQuery.isLoading || categoriesQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando grupo…</p>
  }

  if (groupQuery.isError) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {groupQuery.error.message}
      </p>
    )
  }

  if (!isNew && !groupQuery.data) {
    return (
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h1 className="font-semibold">Grupo no encontrado</h1>
        <Link to="/insumos/grupos" className="mt-4 inline-flex text-sm text-neutral-300 underline">
          Volver a grupos
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
            {isNew ? 'Nuevo grupo' : groupQuery.data?.name}
          </h1>
        </div>
        <Link
          to="/insumos/grupos"
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
            placeholder="Ej. Ron blanco"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            {...register('name')}
          />
          {errors.name ? (
            <p className="mt-1.5 text-sm text-red-400">{errors.name.message}</p>
          ) : null}
        </div>

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

          <div className="flex flex-col justify-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                className="size-4 rounded border-neutral-600 bg-neutral-950"
                {...register('isTiered')}
              />
              Maneja estándar/premium
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
        </div>

        {saveMutation.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {saveMutation.error.message}
          </p>
        ) : null}

        {saveMutation.isSuccess && !isNew ? (
          <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
            Grupo guardado.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Guardando…' : 'Guardar grupo'}
        </button>
      </form>
    </div>
  )
}
