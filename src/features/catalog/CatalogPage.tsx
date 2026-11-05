import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatCurrency } from '@/lib/format'
import { fetchProducts } from './queries'

export function CatalogPage() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
  })

  const isAdmin = profile?.role === 'admin'
  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX')
  const filteredProducts =
    productsQuery.data?.filter((product) => {
      const haystack = `${product.name} ${product.category_name ?? ''}`.toLocaleLowerCase('es-MX')
      return haystack.includes(normalizedSearch)
    }) ?? []

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">Catálogo</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Productos</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to="/insumos"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Insumos
          </Link>
          {isAdmin ? (
            <Link
              to="/catalogo/nuevo"
              className="rounded-xl bg-brand-400 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-brand-300"
            >
              Nuevo
            </Link>
          ) : null}
        </div>
      </section>

      <input
        type="search"
        placeholder="Buscar producto o categoría"
        value={search}
        className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
        onChange={(event) => setSearch(event.target.value)}
      />

      {productsQuery.isLoading ? <p className="text-sm text-neutral-500">Cargando…</p> : null}

      {productsQuery.isError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {productsQuery.error.message}
        </p>
      ) : null}

      {productsQuery.data ? (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">{filteredProducts.length} productos</p>
          {filteredProducts.map((product) => (
            <Link
              key={product.product_id}
              to={`/catalogo/${product.product_id}`}
              className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-600"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{product.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {product.category_name ?? 'Sin categoría'}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold">{formatCurrency(product.price)}</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                {!product.active ? (
                  <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">
                    Inactivo
                  </span>
                ) : null}
                {!product.has_recipe ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-300">
                    Receta pendiente
                  </span>
                ) : null}
                {product.has_recipe && !product.cost_complete ? (
                  <span className="rounded-full bg-yellow-500/15 px-2 py-1 text-yellow-300">
                    Costo pendiente
                  </span>
                ) : null}
                <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">
                  {product.is_alcoholic ? 'Con alcohol' : 'Sin alcohol'}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-400">
                <span>
                  Costo:{' '}
                  {product.estimated_cost === null ? '—' : formatCurrency(product.estimated_cost)}
                </span>
                <span>
                  Margen:{' '}
                  {product.estimated_margin === null
                    ? '—'
                    : formatCurrency(product.estimated_margin)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
