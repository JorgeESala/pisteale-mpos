import { useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/format'
import { downloadCsv, csvMoney } from './costs-export'
import type { CostGap, SimulatedProductCost } from './simulate-costs'

type CostFilter = 'all' | 'complete' | 'pending' | 'no_recipe'
type CostSort = 'name' | 'margin'

type CostsBeveragesPanelProps = {
  results: SimulatedProductCost[]
  categoryNames: Map<string, string>
  canEdit: boolean
  onGoToPrices: (search: string) => void
  onGoToGroup: (groupId: string) => void
  onGoToRecipe: (productId: string) => void
  onOpenDetail: (productId: string) => void
}

const statusLabels = {
  complete: 'Completa',
  pending: 'Pendiente',
  no_recipe: 'Sin receta',
} as const

function statusClass(status: SimulatedProductCost['status']): string {
  if (status === 'complete') return 'bg-green-500/15 text-green-300'
  if (status === 'no_recipe') return 'bg-amber-500/15 text-amber-300'
  return 'bg-yellow-500/15 text-yellow-300'
}

function gapActionLabel(gap: CostGap): string {
  if (gap.type === 'recipe') return 'Editar receta'
  if (gap.type === 'premium') return 'Ver grupo'
  return 'Capturar precio'
}

export function CostsBeveragesPanel({
  results,
  categoryNames,
  canEdit,
  onGoToPrices,
  onGoToGroup,
  onGoToRecipe,
  onOpenDetail,
}: CostsBeveragesPanelProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<CostFilter>('all')
  const [sort, setSort] = useState<CostSort>('name')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX')

  const filtered = useMemo(() => {
    const rows = results.filter((row) => {
      const categoryName = categoryNames.get(row.product.category_id ?? '') ?? ''
      const haystack = `${row.product.name} ${categoryName}`.toLocaleLowerCase('es-MX')
      const matchesSearch = haystack.includes(normalizedSearch)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'complete' && row.status === 'complete') ||
        (filter === 'pending' && row.status === 'pending') ||
        (filter === 'no_recipe' && row.status === 'no_recipe')

      return matchesSearch && matchesFilter
    })

    return rows.sort((a, b) => {
      if (sort === 'margin') {
        const aMargin = a.normalMargin ?? Number.NEGATIVE_INFINITY
        const bMargin = b.normalMargin ?? Number.NEGATIVE_INFINITY
        return bMargin - aMargin
      }

      return a.product.name.localeCompare(b.product.name, 'es-MX')
    })
  }, [categoryNames, filter, normalizedSearch, results, sort])

  function exportCsv() {
    const rows: string[][] = [
      [
        'Bebida',
        'Categoría',
        'Costo normal',
        'Margen normal',
        'Costo premium',
        'Margen premium',
        'Estado',
        'Faltantes',
      ],
      ...filtered.map((row) => [
        row.product.name,
        categoryNames.get(row.product.category_id ?? '') ?? '',
        csvMoney(row.normalCost),
        csvMoney(row.normalMargin),
        csvMoney(row.premiumCost),
        csvMoney(row.premiumMargin),
        statusLabels[row.status],
        row.gaps.map((gap) => gap.label).join(' | '),
      ]),
    ]

    downloadCsv('costos-bebidas-simulados.csv', rows)
  }

  function handleGap(gap: CostGap, productId: string) {
    if (gap.type === 'recipe') {
      onGoToRecipe(productId)
      return
    }

    if (gap.type === 'premium' && gap.groupId) {
      onGoToGroup(gap.groupId)
      return
    }

    onGoToPrices(gap.search ?? gap.label)
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Bebidas</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Costos simulados con hielo a $30.00 / 5 kg. No es el costo del cierre diario.
          </p>
        </div>
        <div className="flex gap-2 no-print">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:border-neutral-500"
          >
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition hover:border-neutral-500"
          >
            Imprimir / PDF
          </button>
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">Costos simulados de bebidas</h1>
        <p className="text-sm text-neutral-600">
          Hielo a $30.00 / 5 kg · {new Date().toLocaleDateString('es-MX')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 no-print sm:grid-cols-[1fr_auto_auto]">
        <input
          type="search"
          value={search}
          placeholder="Buscar bebida o categoría"
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
        />
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as CostFilter)}
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
        >
          <option value="all">Todas</option>
          <option value="complete">Completas</option>
          <option value="pending">Pendientes</option>
          <option value="no_recipe">Sin receta</option>
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as CostSort)}
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
        >
          <option value="name">Ordenar por nombre</option>
          <option value="margin">Ordenar por margen</option>
        </select>
      </div>

      <p className="text-xs text-neutral-500 no-print">{filtered.length} bebidas</p>

      <div className="space-y-3">
        {filtered.map((row) => {
          const expanded = expandedId === row.product.id
          const hasGaps = row.gaps.length > 0

          return (
            <article
              key={row.product.id}
              role="button"
              tabIndex={0}
              aria-label={`Ver desglose de ${row.product.name}`}
              onClick={() => onOpenDetail(row.product.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenDetail(row.product.id)
                }
              }}
              className="cursor-pointer space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-600 print:break-inside-avoid"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.product.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {categoryNames.get(row.product.category_id ?? '') ?? 'Sin categoría'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${statusClass(row.status)}`}
                >
                  {statusLabels[row.status]}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <p className="text-[11px] text-neutral-500">Normal</p>
                  <p className="mt-1">
                    Costo:{' '}
                    <span className="font-semibold">
                      {row.normalCost === null ? '—' : formatCurrency(row.normalCost)}
                    </span>
                  </p>
                  <p className="mt-1">
                    Margen:{' '}
                    <span className="font-semibold">
                      {row.normalMargin === null ? '—' : formatCurrency(row.normalMargin)}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <p className="text-[11px] text-brand-300">Premium</p>
                  <p className="mt-1">
                    Costo:{' '}
                    <span className="font-semibold">
                      {row.premiumCost === null ? '—' : formatCurrency(row.premiumCost)}
                    </span>
                  </p>
                  <p className="mt-1">
                    Margen:{' '}
                    <span className="font-semibold">
                      {row.premiumMargin === null ? '—' : formatCurrency(row.premiumMargin)}
                    </span>
                  </p>
                </div>
              </div>

              {hasGaps ? (
                <div className="no-print">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setExpandedId(expanded ? null : row.product.id)
                    }}
                    className="text-xs text-yellow-300 underline"
                  >
                    {expanded ? 'Ocultar qué falta' : `Ver qué falta (${row.gaps.length})`}
                  </button>

                  {expanded ? (
                    <div className="mt-2 space-y-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3">
                      {row.gaps.map((gap) => (
                        <div
                          key={`${gap.type}:${gap.groupId ?? ''}:${gap.tier ?? ''}`}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <span className="text-yellow-200">{gap.label}</span>
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleGap(gap, row.product.id)
                              }}
                              className="rounded-lg border border-yellow-500/30 px-2 py-1 text-yellow-200"
                            >
                              {gapActionLabel(gap)}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <p className="text-[11px] text-neutral-600 no-print">Toca para ver el desglose</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
