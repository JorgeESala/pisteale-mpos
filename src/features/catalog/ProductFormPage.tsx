import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'
import { productFormSchema, type ProductForm } from './catalog-schemas'
import { RecipeEditor } from './RecipeEditor'
import { fetchProduct, fetchProductCategories } from './queries'

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const isNew = id === 'nuevo'
  const productId = isNew ? undefined : id
  const isAdmin = profile?.role === 'admin'

  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProduct(productId!),
    enabled: Boolean(productId),
  })

  const categoriesQuery = useQuery({
    queryKey: ['product_categories'],
    queryFn: fetchProductCategories,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductForm>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: '',
      description: '',
      categoryId: '',
      kind: 'preparado',
      price: 120,
      isAlcoholic: true,
      servingSizeMl: 1000,
      active: true,
      notes: '',
    },
  })

  useEffect(() => {
    const product = productQuery.data
    if (!product) return

    reset({
      name: product.name,
      description: product.description,
      categoryId: product.category_id ?? '',
      kind: product.kind,
      price: product.price,
      isAlcoholic: product.is_alcoholic,
      servingSizeMl: product.serving_size_ml,
      active: product.active,
      notes: product.notes,
    })
  }, [productQuery.data, reset])

  const saveMutation = useMutation({
    mutationFn: async (values: ProductForm) => {
      const targetId = isNew ? crypto.randomUUID() : productId!

      const { data, error } = await supabase.rpc('upsert_product', {
        p_id: targetId,
        p_name: values.name,
        p_description: values.description ?? '',
        p_category_id: values.categoryId || null,
        p_kind: values.kind,
        p_price: values.price,
        p_is_alcoholic: values.isAlcoholic,
        p_serving_size_ml: values.servingSizeMl,
        p_inventory_item_id: productQuery.data?.inventory_item_id ?? null,
        p_active: values.active,
        p_notes: values.notes ?? '',
      })

      if (error) throw error

      return { product: data, created: isNew }
    },
    onSuccess: ({ product, created }) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['product', product.id] })

      if (created) {
        navigate(`/catalogo/${product.id}`, { replace: true })
      }
    },
  })

  async function onSubmit(values: ProductForm) {
    await saveMutation.mutateAsync(values)
  }

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
        <h1 className="font-semibold">Acceso restringido</h1>
        <p className="mt-1 text-sm">Solo administradores pueden editar el catálogo.</p>
        <Link to="/catalogo" className="mt-4 inline-flex text-sm text-amber-100 underline">
          Volver al catálogo
        </Link>
      </section>
    )
  }

  if (productQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando producto…</p>
  }

  if (productQuery.isError) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {productQuery.error.message}
      </p>
    )
  }

  if (!isNew && !productQuery.data) {
    return (
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h1 className="font-semibold">Producto no encontrado</h1>
        <Link to="/catalogo" className="mt-4 inline-flex text-sm text-neutral-300 underline">
          Volver al catálogo
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
            {isNew ? 'Nuevo producto' : productQuery.data?.name}
          </h1>
        </div>
        <Link
          to="/catalogo"
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
              <option value="preparado">Preparado</option>
              <option value="servicio">Servicio</option>
              <option value="botella">Botella</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="price" className="mb-1.5 block text-sm text-neutral-300">
              Precio
            </label>
            <input
              id="price"
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('price', { valueAsNumber: true })}
            />
            {errors.price ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.price.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="servingSizeMl" className="mb-1.5 block text-sm text-neutral-300">
              Tamaño (ml)
            </label>
            <input
              id="servingSizeMl"
              type="number"
              min="1"
              step="1"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
              {...register('servingSizeMl', { valueAsNumber: true })}
            />
            {errors.servingSizeMl ? (
              <p className="mt-1.5 text-sm text-red-400">{errors.servingSizeMl.message}</p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm text-neutral-300">
            Descripción
          </label>
          <textarea
            id="description"
            rows={3}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            {...register('description')}
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              className="size-4 rounded border-neutral-600 bg-neutral-950"
              {...register('isAlcoholic')}
            />
            Con alcohol
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

        <div>
          <label htmlFor="notes" className="mb-1.5 block text-sm text-neutral-300">
            Notas
          </label>
          <textarea
            id="notes"
            rows={2}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            {...register('notes')}
          />
        </div>

        {saveMutation.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {saveMutation.error.message}
          </p>
        ) : null}

        {saveMutation.isSuccess && !isNew ? (
          <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
            Producto guardado.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Guardando…' : 'Guardar producto'}
        </button>

        {isNew ? (
          <p className="text-xs text-neutral-500">
            Después de guardar podrás agregar la receta y los costos.
          </p>
        ) : null}
      </form>

      {!isNew && productQuery.data ? <RecipeEditor product={productQuery.data} /> : null}
    </div>
  )
}
