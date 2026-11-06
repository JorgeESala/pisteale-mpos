import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchIceCost7d, fetchIceDailyRecords, fetchProducts } from '@/features/catalog/queries'
import {
  fetchBottleStock,
  fetchInventoryStock,
  fetchInventoryWaste,
  fetchPurchases,
} from '@/features/inventory/queries'
import { formatCurrency } from '@/lib/format'
import { formatDate, wasteReasonLabels } from '@/features/inventory/inventory-utils'
import type { InventoryWasteReason } from '@/types/database'

type ReportPeriod = 'month' | '30d' | 'year'

function isoDate(date: Date) {
  return date.toLocaleDateString('en-CA')
}

function getRange(period: ReportPeriod) {
  const today = new Date()
  const to = isoDate(today)

  if (period === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: isoDate(from), to, label: 'Este mes' }
  }

  if (period === '30d') {
    const from = new Date(today)
    from.setDate(from.getDate() - 29)
    return { from: isoDate(from), to, label: 'Últimos 30 días' }
  }

  const from = new Date(today.getFullYear(), 0, 1)
  return { from: isoDate(from), to, label: 'Este año' }
}

const periodOptions: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'month', label: 'Este mes' },
  { value: '30d', label: '30 días' },
  { value: 'year', label: 'Este año' },
]

export function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const range = getRange(period)

  const stockQuery = useQuery({
    queryKey: ['inventory_stock'],
    queryFn: fetchInventoryStock,
  })

  const bottleStockQuery = useQuery({
    queryKey: ['bottle_stock'],
    queryFn: fetchBottleStock,
  })

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
  })

  const purchasesQuery = useQuery({
    queryKey: ['purchases', 'report', range.from, range.to],
    queryFn: () => fetchPurchases(500, range.from, range.to),
  })

  const wasteQuery = useQuery({
    queryKey: ['inventory_waste', 'report', range.from, range.to],
    queryFn: () => fetchInventoryWaste(range.from, range.to, 500),
  })

  const iceQuery = useQuery({
    queryKey: ['ice_daily_records', 'report', range.from, range.to],
    queryFn: () => fetchIceDailyRecords(range.from, range.to, 500),
  })

  const iceAverageQuery = useQuery({
    queryKey: ['ice_cost_7d'],
    queryFn: fetchIceCost7d,
  })

  if (
    stockQuery.isLoading ||
    bottleStockQuery.isLoading ||
    productsQuery.isLoading ||
    purchasesQuery.isLoading ||
    wasteQuery.isLoading ||
    iceQuery.isLoading ||
    iceAverageQuery.isLoading
  ) {
    return <p className="text-sm text-neutral-500">Cargando reportes…</p>
  }

  if (
    stockQuery.isError ||
    bottleStockQuery.isError ||
    productsQuery.isError ||
    purchasesQuery.isError ||
    wasteQuery.isError ||
    iceQuery.isError ||
    iceAverageQuery.isError
  ) {
    const error =
      stockQuery.error ??
      bottleStockQuery.error ??
      productsQuery.error ??
      purchasesQuery.error ??
      wasteQuery.error ??
      iceQuery.error ??
      iceAverageQuery.error
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error?.message}
      </p>
    )
  }

  const stock = (stockQuery.data ?? []).filter((item) => item.track_stock)
  const bottleStock = (bottleStockQuery.data ?? []).filter(
    (item) => item.track_stock && item.base_unit === 'ml',
  )
  const products = productsQuery.data ?? []
  const purchases = purchasesQuery.data ?? []
  const waste = wasteQuery.data ?? []
  const ice = iceQuery.data ?? []

  const stockValue = stock.reduce((sum, item) => sum + item.stock_value, 0)
  const openBottles = bottleStock.reduce((sum, item) => sum + item.open_count, 0)
  const openMl = bottleStock.reduce((sum, item) => sum + item.open_ml, 0)
  const openValue = bottleStock.reduce((sum, item) => sum + item.open_value, 0)
  const lowStock = stock.filter((item) => item.stock_status === 'low').length
  const outStock = stock.filter((item) => item.stock_status === 'out').length
  const purchasesTotal = purchases.reduce((sum, purchase) => sum + purchase.total_cost, 0)
  const wasteTotal = waste.reduce((sum, record) => sum + record.total_cost, 0)
  const iceTotal = ice.reduce((sum, record) => sum + record.total_cost, 0)
  const drinks = ice.reduce((sum, record) => sum + record.drinks_sold, 0)
  const icePerDrink = drinks > 0 ? iceTotal / drinks : null

  const wasteByReason = new Map<InventoryWasteReason, { count: number; total: number }>()

  for (const record of waste) {
    const current = wasteByReason.get(record.reason) ?? { count: 0, total: 0 }
    wasteByReason.set(record.reason, {
      count: current.count + 1,
      total: current.total + record.total_cost,
    })
  }

  const purchasesBySupplier = new Map<string, { count: number; total: number }>()
  for (const purchase of purchases) {
    const key = purchase.supplier.trim() || 'Sin proveedor'
    const current = purchasesBySupplier.get(key) ?? { count: 0, total: 0 }
    purchasesBySupplier.set(key, {
      count: current.count + 1,
      total: current.total + purchase.total_cost,
    })
  }

  const stockByCategory = new Map<string, { count: number; total: number }>()
  for (const item of stock) {
    const key = item.category_name ?? 'Sin categoría'
    const current = stockByCategory.get(key) ?? { count: 0, total: 0 }
    stockByCategory.set(key, {
      count: current.count + 1,
      total: current.total + item.stock_value,
    })
  }

  const pendingProducts = products.filter(
    (product) => product.has_recipe && !product.normal_cost_complete,
  ).length
  const productsWithoutRecipe = products.filter((product) => !product.has_recipe).length
  const completeMargins = products
    .map((product) => product.normal_margin)
    .filter((margin): margin is number => margin !== null)
  const averageMargin =
    completeMargins.length > 0
      ? completeMargins.reduce((sum, margin) => sum + margin, 0) / completeMargins.length
      : null

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">PISTEALE</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reportes</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {range.label} · {formatDate(range.from)} a {formatDate(range.to)}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            to="/insumos/stock"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Stock
          </Link>
          <Link
            to="/insumos/compras"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Compras
          </Link>
          <Link
            to="/insumos/merma"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Merma
          </Link>
          <Link
            to="/insumos/botellas"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Botellas
          </Link>
        </div>
      </section>

      <div className="flex gap-2">
        {periodOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setPeriod(option.value)}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm transition ${
              period === option.value
                ? 'border-brand-400 bg-brand-400/10 text-brand-300'
                : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-[11px] text-neutral-500">Valor del stock</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(stockValue)}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-[11px] text-neutral-500">Compras del periodo</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(purchasesTotal)}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-[11px] text-neutral-500">Merma del periodo</p>
          <p className="mt-1 text-xl font-semibold text-red-300">{formatCurrency(wasteTotal)}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-[11px] text-neutral-500">Gasto de hielo</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(iceTotal)}</p>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Bajo mínimo</p>
          <p className="mt-1 text-lg font-semibold text-yellow-300">{lowStock}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Agotados</p>
          <p className="mt-1 text-lg font-semibold text-red-300">{outStock}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] text-neutral-500">Costos pendientes</p>
          <p className="mt-1 text-lg font-semibold text-yellow-300">{pendingProducts}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">Hielo</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-neutral-500">Consumo del periodo</p>
            <p>{formatCurrency(iceTotal)}</p>
          </div>
          <div>
            <p className="text-neutral-500">Bebidas registradas</p>
            <p>{drinks}</p>
          </div>
          <div>
            <p className="text-neutral-500">Costo por bebida del periodo</p>
            <p>{icePerDrink === null ? '—' : formatCurrency(icePerDrink)}</p>
          </div>
          <div>
            <p className="text-neutral-500">Promedio actual 7 días</p>
            <p>
              {iceAverageQuery.data?.cost_per_drink !== null &&
              iceAverageQuery.data?.cost_per_drink !== undefined
                ? formatCurrency(iceAverageQuery.data.cost_per_drink)
                : 'Pendiente'}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">Botellas abiertas</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-neutral-500">Botellas</p>
            <p>{openBottles}</p>
          </div>
          <div>
            <p className="text-neutral-500">Líquido abierto</p>
            <p>{openMl.toLocaleString('es-MX', { maximumFractionDigits: 4 })} ml</p>
          </div>
          <div>
            <p className="text-neutral-500">Valor abierto</p>
            <p>{formatCurrency(openValue)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">Merma por motivo</h2>
        {wasteByReason.size === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Sin mermas en el periodo.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {[...wasteByReason.entries()]
              .sort((a, b) => b[1].total - a[1].total)
              .map(([reason, data]) => (
                <div key={reason} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-neutral-400">
                    {wasteReasonLabels[reason]} · {data.count}{' '}
                    {data.count === 1 ? 'registro' : 'registros'}
                  </span>
                  <span className="font-medium">{formatCurrency(data.total)}</span>
                </div>
              ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">Compras por proveedor</h2>
        {purchasesBySupplier.size === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Sin compras en el periodo.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {[...purchasesBySupplier.entries()]
              .sort((a, b) => b[1].total - a[1].total)
              .map(([supplier, data]) => (
                <div key={supplier} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-neutral-400">
                    {supplier} · {data.count} {data.count === 1 ? 'compra' : 'compras'}
                  </span>
                  <span className="font-medium">{formatCurrency(data.total)}</span>
                </div>
              ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">Stock por categoría</h2>
        {stockByCategory.size === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Sin insumos inventariables.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {[...stockByCategory.entries()]
              .sort((a, b) => b[1].total - a[1].total)
              .map(([category, data]) => (
                <div key={category} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-neutral-400">
                    {category} · {data.count} {data.count === 1 ? 'insumo' : 'insumos'}
                  </span>
                  <span className="font-medium">{formatCurrency(data.total)}</span>
                </div>
              ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">Costos de productos</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-neutral-500">Productos con costo completo</p>
            <p>{products.filter((product) => product.normal_cost_complete).length}</p>
          </div>
          <div>
            <p className="text-neutral-500">Costos pendientes</p>
            <p>{pendingProducts}</p>
          </div>
          <div>
            <p className="text-neutral-500">Productos sin receta</p>
            <p>{productsWithoutRecipe}</p>
          </div>
          <div>
            <p className="text-neutral-500">Margen normal promedio</p>
            <p>{averageMargin === null ? '—' : formatCurrency(averageMargin)}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Los reportes de ventas se agregarán cuando esté el módulo de pedidos.
        </p>
      </section>
    </div>
  )
}
