import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { fetchProductCategories } from '@/features/catalog/queries'
import { fetchPromotions, upsertPromotion } from '@/features/sales/queries'
import { promotionFormSchema, type PromotionForm } from './promotion-schemas'

const defaults: PromotionForm = {
  name: '',
  bundleQty: 2,
  fixedPrice: 180,
  appliesTo: 'alcoholic',
  appliesToTier: 'normal',
  includeCategoryIds: [],
  excludeCategoryIds: [],
  automatic: false,
  active: true,
  sortOrder: 0,
  lineTargeted: false,
  maxPerOrder: null,
}

export function PromotionFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const isNew = id === 'nuevo'

  const promotionsQuery = useQuery({
    queryKey: ['promotions'],
    queryFn: fetchPromotions,
    enabled: isAdmin,
  })

  const categoriesQuery = useQuery({
    queryKey: ['product_categories'],
    queryFn: fetchProductCategories,
    enabled: isAdmin,
  })

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PromotionForm>({
    resolver: zodResolver(promotionFormSchema),
    defaultValues: defaults,
  })

  const includeCategoryIds = useWatch({ control, name: 'includeCategoryIds' }) ?? []
  const excludeCategoryIds = useWatch({ control, name: 'excludeCategoryIds' }) ?? []
  const promotion = promotionsQuery.data?.find((candidate) => candidate.id === id)
  const initializedRef = useRef<string | null>(null)
  const initializedKey = isNew ? 'new' : (id ?? '')

  useEffect(() => {
    if (!isAdmin || !categoriesQuery.isSuccess) return
    if (!isNew && !promotion) return
    if (initializedRef.current === initializedKey) return

    initializedRef.current = initializedKey

    if (promotion) {
      reset({
        name: promotion.name,
        bundleQty: promotion.bundle_qty,
        fixedPrice: promotion.fixed_price,
        appliesTo: promotion.applies_to,
        appliesToTier: promotion.applies_to_tier,
        includeCategoryIds: promotion.include_category_ids,
        excludeCategoryIds: promotion.exclude_category_ids,
        automatic: promotion.automatic,
        active: promotion.active,
        sortOrder: promotion.sort_order,
        lineTargeted: promotion.line_targeted,
        maxPerOrder: promotion.max_per_order,
      })
    } else {
      reset(defaults)
    }
  }, [categoriesQuery.isSuccess, initializedKey, isAdmin, isNew, promotion, reset])

  const saveMutation = useMutation({
    mutationFn: (values: PromotionForm) =>
      upsertPromotion({
        id: isNew ? null : id!,
        name: values.name,
        bundleQty: values.bundleQty,
        fixedPrice: values.fixedPrice,
        appliesTo: values.appliesTo,
        appliesToTier: values.appliesToTier,
        includeCategoryIds: values.includeCategoryIds,
        excludeCategoryIds: values.excludeCategoryIds,
        automatic: values.automatic,
        active: values.active,
        sortOrder: values.sortOrder,
        lineTargeted: values.lineTargeted,
        maxPerOrder: values.maxPerOrder,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['promotions'] })
      navigate('/promociones')
    },
  })

  async function onSubmit(values: PromotionForm) {
    await saveMutation.mutateAsync(values)
  }

  function toggleCategory(
    field: 'includeCategoryIds' | 'excludeCategoryIds',
    categoryId: string,
    checked: boolean,
  ) {
    const current = field === 'includeCategoryIds' ? includeCategoryIds : excludeCategoryIds
    setValue(
      field,
      checked ? [...current, categoryId] : current.filter((id) => id !== categoryId),
      { shouldDirty: true },
    )
  }

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
        <h1 className="font-semibold">Acceso restringido</h1>
        <p className="mt-1 text-sm">Solo administradores pueden configurar promociones.</p>
        <Link to="/" className="mt-4 inline-flex text-sm text-amber-100 underline">
          Volver al inicio
        </Link>
      </section>
    )
  }

  if (promotionsQuery.isLoading || categoriesQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando promoción…</p>
  }

  if (promotionsQuery.isError || categoriesQuery.isError) {
    const error = promotionsQuery.error ?? categoriesQuery.error
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error?.message}
      </p>
    )
  }

  if (!isNew && !promotion) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">No se encontró la promoción.</p>
        <Link to="/promociones" className="text-sm text-brand-300 underline">
          Volver a promociones
        </Link>
      </div>
    )
  }

  const categories = categoriesQuery.data ?? []

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Promociones</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {isNew ? 'Nueva promoción' : promotion?.name}
          </h1>
        </div>
        <Link
          to="/promociones"
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
          <label htmlFor="promotionName" className="mb-1.5 block text-sm text-neutral-300">
            Nombre
          </label>
          <input
            id="promotionName"
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
            <label htmlFor="bundleQty" className="mb-1.5 block text-sm text-neutral-300">
              Bebidas por promoción
            </label>
            <input
              id="bundleQty"
              type="number"
              min="1"
              step="1"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('bundleQty', { valueAsNumber: true })}
            />
            {errors.bundleQty ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.bundleQty.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="fixedPrice" className="mb-1.5 block text-sm text-neutral-300">
              Precio de la promoción
            </label>
            <input
              id="fixedPrice"
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('fixedPrice', { valueAsNumber: true })}
            />
            {errors.fixedPrice ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.fixedPrice.message}</p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="appliesTo" className="mb-1.5 block text-sm text-neutral-300">
              Aplica a
            </label>
            <select
              id="appliesTo"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('appliesTo')}
            >
              <option value="alcoholic">Con alcohol</option>
              <option value="non_alcoholic">Sin alcohol</option>
              <option value="any">Cualquier bebida</option>
            </select>
          </div>

          <div>
            <label htmlFor="appliesToTier" className="mb-1.5 block text-sm text-neutral-300">
              Tier
            </label>
            <select
              id="appliesToTier"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('appliesToTier')}
            >
              <option value="any">Cualquier tier</option>
              <option value="normal">Normal</option>
              <option value="premium">Premium</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="sortOrder" className="mb-1.5 block text-sm text-neutral-300">
            Orden
          </label>
          <input
            id="sortOrder"
            type="number"
            step="1"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            {...register('sortOrder', { valueAsNumber: true })}
          />
        </div>

        <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
          <p className="text-sm font-medium text-neutral-200">Categorías incluidas</p>
          <p className="text-[11px] text-neutral-500">
            Si no eliges ninguna, aplica a todas las categorías.
          </p>
          {categories.map((category) => (
            <label key={category.id} className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={includeCategoryIds.includes(category.id)}
                onChange={(event) =>
                  toggleCategory('includeCategoryIds', category.id, event.target.checked)
                }
                className="size-4 rounded border-neutral-600 bg-neutral-950"
              />
              {category.name}
            </label>
          ))}
          {errors.includeCategoryIds ? (
            <p className="text-sm text-red-400">{errors.includeCategoryIds.message}</p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
          <p className="text-sm font-medium text-neutral-200">Categorías excluidas</p>
          {categories.map((category) => (
            <label key={category.id} className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={excludeCategoryIds.includes(category.id)}
                onChange={(event) =>
                  toggleCategory('excludeCategoryIds', category.id, event.target.checked)
                }
                className="size-4 rounded border-neutral-600 bg-neutral-950"
              />
              {category.name}
            </label>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
          <label className="flex items-start gap-3 text-sm text-neutral-300">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-neutral-600 bg-neutral-950"
              {...register('lineTargeted')}
            />
            <span>
              <span className="block font-medium text-neutral-200">Precio por línea</span>
              <span className="block text-neutral-500">
                El cajero aplica la promoción a una bebida específica. Requiere 1 bebida.
              </span>
            </span>
          </label>

          <div>
            <label htmlFor="maxPerOrder" className="mb-1.5 block text-sm text-neutral-300">
              Máximo por ticket (opcional)
            </label>
            <input
              id="maxPerOrder"
              type="number"
              min="1"
              step="1"
              placeholder="Sin límite"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('maxPerOrder', {
                setValueAs: (value) => (value === '' ? null : Number(value)),
              })}
            />
            {errors.maxPerOrder ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.maxPerOrder.message}</p>
            ) : null}
          </div>
        </div>

        <label className="flex items-start gap-3 text-sm text-neutral-300">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-neutral-600 bg-neutral-950"
            {...register('automatic')}
          />
          <span>
            <span className="block font-medium text-neutral-200">Aplicar automáticamente</span>
            <span className="block text-neutral-500">
              Se aplica sin que el cajero la seleccione. Si está desactivado, será manual.
            </span>
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            className="size-4 rounded border-neutral-600 bg-neutral-950"
            {...register('active')}
          />
          Promoción activa
        </label>

        {saveMutation.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {saveMutation.error.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Guardando…' : 'Guardar promoción'}
        </button>
      </form>
    </div>
  )
}
