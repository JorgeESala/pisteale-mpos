import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatCurrency } from '@/lib/format'
import type { OrderTier, PaymentMethod, Promotion, SaleWarning } from '@/types/database'
import { formatDateTime } from '@/features/inventory/inventory-utils'
import {
  addSaleLine,
  canSellPremium,
  type SaleCartLine,
  saleLineTotal,
  saleSubtotal,
} from './sales-cart'
import {
  createSale,
  fetchOrders,
  fetchPromotions,
  fetchSaleProducts,
  previewSale,
  type LinePromotionTarget,
} from './queries'
import { warningText } from './sales-warnings'

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
}

const tierLabels: Record<OrderTier, string> = {
  normal: 'Normal',
  premium: 'Premium',
}

export function SalesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const productsQuery = useQuery({
    queryKey: ['sale_products'],
    queryFn: fetchSaleProducts,
  })

  const ordersQuery = useQuery({
    queryKey: ['orders'],
    queryFn: () => fetchOrders(20),
  })

  const promotionsQuery = useQuery({
    queryKey: ['promotions'],
    queryFn: fetchPromotions,
  })

  const [cart, setCart] = useState<SaleCartLine[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedTier, setSelectedTier] = useState<OrderTier>('normal')
  const [qty, setQty] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [tip, setTip] = useState(0)
  const [notes, setNotes] = useState('')
  const [selectedPromotionIds, setSelectedPromotionIds] = useState<string[]>([])
  const [linePromotion, setLinePromotion] = useState<LinePromotionTarget | null>(null)
  const [warnings, setWarnings] = useState<SaleWarning[]>([])
  const [showWarnings, setShowWarnings] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const products = productsQuery.data ?? []
  const selectedProduct = products.find((product) => product.id === selectedProductId)
  const saleItems = cart.map((line) => ({
    productId: line.productId,
    tier: line.tier,
    qty: line.qty,
  }))
  const subtotal = saleSubtotal(cart)
  const previewQuery = useQuery({
    queryKey: [
      'sale_preview',
      JSON.stringify(saleItems),
      selectedPromotionIds.join(','),
      JSON.stringify(linePromotion),
    ],
    queryFn: () => previewSale(saleItems, selectedPromotionIds, linePromotion),
    enabled: cart.length > 0,
  })
  const gross = previewQuery.data?.gross_total ?? subtotal
  const discount = previewQuery.data?.discount_total ?? 0
  const netSubtotal = previewQuery.data?.subtotal ?? subtotal
  const total = Math.round((netSubtotal + tip) * 100) / 100
  const manualPromotions = (promotionsQuery.data ?? []).filter(
    (promotion) => promotion.active && !promotion.automatic && !promotion.line_targeted,
  )
  const linePromotionRule = (promotionsQuery.data ?? []).find(
    (promotion) => promotion.active && promotion.line_targeted,
  )
  const appliedPromotionIds = new Set(
    (previewQuery.data?.promotions ?? []).map((promotion) => promotion.promotion_id),
  )

  const createMutation = useMutation({
    mutationFn: () =>
      createSale({
        items: saleItems,
        promotionIds: selectedPromotionIds,
        linePromotion,
        paymentMethod,
        reference,
        tip,
        notes,
      }),
    onSuccess: (orderId) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_stock'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_stock_item'] })
      void queryClient.invalidateQueries({ queryKey: ['inventory_movements'] })
      void queryClient.invalidateQueries({ queryKey: ['bottle_stock'] })
      void queryClient.invalidateQueries({ queryKey: ['bottle_openings'] })
      void queryClient.invalidateQueries({ queryKey: ['bottle_opening'] })
      void queryClient.invalidateQueries({ queryKey: ['bottle_movements'] })
      setCart([])
      setSelectedPromotionIds([])
      setLinePromotion(null)
      setWarnings([])
      setShowWarnings(false)
      setTip(0)
      setReference('')
      setNotes('')
      navigate(`/pedidos/${orderId}`)
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  function handleProductChange(productId: string) {
    setSelectedProductId(productId)
    const product = products.find((candidate) => candidate.id === productId)
    if (!product || !canSellPremium(product)) {
      setSelectedTier('normal')
    }
  }

  function addLine() {
    setError(null)
    if (!selectedProduct) {
      setError('Selecciona un producto.')
      return
    }

    if (!Number.isInteger(qty) || qty < 1) {
      setError('La cantidad debe ser un entero mayor a cero.')
      return
    }

    setCart((current) => addSaleLine(current, selectedProduct, selectedTier, qty))
    setSelectedProductId('')
    setSelectedTier('normal')
    setQty(1)
  }

  function removeLine(index: number) {
    const removed = cart[index]
    if (
      removed &&
      linePromotion?.productId === removed.productId &&
      linePromotion.tier === removed.tier
    ) {
      setLinePromotion(null)
    }
    setCart((current) => current.filter((_, lineIndex) => lineIndex !== index))
  }

  function toggleLinePromotion(line: SaleCartLine) {
    if (!linePromotionRule || line.tier !== 'normal') return

    setShowWarnings(false)
    setLinePromotion((current) =>
      current?.productId === line.productId && current.tier === line.tier
        ? null
        : {
            promotionId: linePromotionRule.id,
            productId: line.productId,
            tier: line.tier,
          },
    )
  }

  async function completeSale() {
    setError(null)
    await createMutation.mutateAsync()
  }

  function handleCheckout() {
    setError(null)
    if (cart.length === 0) {
      setError('Agrega al menos un producto.')
      return
    }

    if (!Number.isFinite(tip) || tip < 0) {
      setError('La propina no puede ser negativa.')
      return
    }

    if (previewQuery.isError) {
      setError(previewQuery.error.message)
      return
    }

    const currentWarnings = previewQuery.data?.warnings ?? []
    if (currentWarnings.length > 0) {
      setWarnings(currentWarnings)
      setShowWarnings(true)
      return
    }

    void completeSale()
  }

  function togglePromotion(promotion: Promotion) {
    setShowWarnings(false)
    setSelectedPromotionIds((current) =>
      current.includes(promotion.id)
        ? current.filter((id) => id !== promotion.id)
        : [...current, promotion.id],
    )
  }

  if (productsQuery.isLoading || ordersQuery.isLoading || promotionsQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando ventas…</p>
  }

  if (productsQuery.isError || ordersQuery.isError || promotionsQuery.isError) {
    const queryError = productsQuery.error ?? ordersQuery.error ?? promotionsQuery.error
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {queryError?.message}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">PISTEALE</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Pedidos</h1>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            to="/insumos/stock"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Stock
          </Link>
          <Link
            to="/reportes"
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Reportes
          </Link>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div>
          <h2 className="font-semibold">Nueva venta</h2>
          <p className="mt-1 text-sm text-neutral-400">
            La venta no se bloquea por falta de stock; se muestra una advertencia antes de cobrar.
          </p>
        </div>

        <div>
          <label htmlFor="saleProduct" className="mb-1.5 block text-sm text-neutral-300">
            Producto
          </label>
          <select
            id="saleProduct"
            value={selectedProductId}
            onChange={(event) => handleProductChange(event.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
          >
            <option value="">Selecciona un producto</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · {formatCurrency(product.price)}
                {product.premium_price !== null
                  ? ` / ${formatCurrency(product.premium_price)} premium`
                  : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="saleTier" className="mb-1.5 block text-sm text-neutral-300">
              Tier
            </label>
            <select
              id="saleTier"
              value={selectedTier}
              disabled={!selectedProduct || !canSellPremium(selectedProduct)}
              onChange={(event) => setSelectedTier(event.target.value as OrderTier)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400 disabled:opacity-60"
            >
              <option value="normal">Normal</option>
              <option value="premium">Premium</option>
            </select>
          </div>

          <div>
            <label htmlFor="saleQty" className="mb-1.5 block text-sm text-neutral-300">
              Cantidad
            </label>
            <input
              id="saleQty"
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(event) => setQty(Number(event.target.value))}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            />
          </div>
        </div>

        {selectedProduct ? (
          <p className="text-xs text-neutral-500">
            Precio por bebida:{' '}
            {formatCurrency(
              selectedTier === 'premium' && selectedProduct.premium_price !== null
                ? selectedProduct.premium_price
                : selectedProduct.price,
            )}
          </p>
        ) : null}

        <button
          type="button"
          onClick={addLine}
          className="w-full rounded-xl border border-neutral-700 px-4 py-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500"
        >
          Agregar al pedido
        </button>
      </section>

      <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-semibold">Carrito</h2>
          <p className="text-xs text-neutral-500">
            {cart.length} {cart.length === 1 ? 'línea' : 'líneas'}
          </p>
        </div>

        {cart.length === 0 ? (
          <p className="text-sm text-neutral-500">El carrito está vacío.</p>
        ) : null}

        {cart.map((line, index) => (
          <div
            key={`${line.productId}-${line.tier}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{line.productName}</p>
              <p className="text-xs text-neutral-500">
                {tierLabels[line.tier]} · {line.qty} × {formatCurrency(line.unitPrice)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <p className="text-sm font-semibold">{formatCurrency(saleLineTotal(line))}</p>
              <div className="flex flex-wrap justify-end gap-2">
                {linePromotionRule && line.tier === 'normal' ? (
                  <button
                    type="button"
                    onClick={() => toggleLinePromotion(line)}
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      linePromotion?.productId === line.productId &&
                      linePromotion.tier === line.tier
                        ? 'border-brand-400 bg-brand-400/10 text-brand-200'
                        : 'border-neutral-700 text-neutral-300'
                    }`}
                  >
                    {linePromotion?.productId === line.productId && linePromotion.tier === line.tier
                      ? 'Quitar precio socio'
                      : 'Precio socio'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300"
                >
                  Quitar
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="space-y-2 border-t border-neutral-800 pt-3 text-sm">
          <div className="flex justify-between gap-3 text-neutral-400">
            <span>Precio de lista</span>
            <span>{formatCurrency(gross)}</span>
          </div>
          {discount > 0 ? (
            <div className="flex justify-between gap-3 text-green-300">
              <span>Descuento promociones</span>
              <span>-{formatCurrency(discount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 text-neutral-400">
            <span>Subtotal</span>
            <span>{formatCurrency(netSubtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-neutral-400">
            <label htmlFor="saleTip">Propina</label>
            <input
              id="saleTip"
              type="number"
              min="0"
              step="0.01"
              value={tip}
              onChange={(event) => setTip(Number(event.target.value) || 0)}
              className="w-28 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-right text-sm text-neutral-100 outline-none focus:border-brand-400"
            />
          </div>
          <div className="flex justify-between gap-3 text-base font-semibold">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
          {previewQuery.isFetching ? (
            <p className="text-[11px] text-neutral-500">Calculando promociones…</p>
          ) : null}
          {previewQuery.isError ? (
            <p className="text-[11px] text-red-300">{previewQuery.error.message}</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">Promociones</h2>

        {previewQuery.data?.promotions.map((promotion) => (
          <div
            key={promotion.promotion_id}
            className="flex items-center justify-between gap-3 rounded-xl border border-brand-400/30 bg-brand-400/10 p-3 text-sm"
          >
            <div>
              <p className="font-medium text-brand-200">{promotion.promotion_name}</p>
              <p className="text-xs text-neutral-400">
                {promotion.line_targeted
                  ? 'Precio socio'
                  : promotion.automatic
                    ? 'Automática'
                    : 'Manual'}{' '}
                · {promotion.applications}{' '}
                {promotion.applications === 1 ? 'aplicación' : 'aplicaciones'}
              </p>
            </div>
            <span className="font-semibold text-green-300">
              -{formatCurrency(promotion.discount_amount)}
            </span>
          </div>
        ))}

        {manualPromotions.length === 0 ? (
          <p className="text-sm text-neutral-500">No hay promociones manuales activas.</p>
        ) : (
          <div className="space-y-2">
            {manualPromotions.map((promotion) => {
              const selected = selectedPromotionIds.includes(promotion.id)
              const applied = appliedPromotionIds.has(promotion.id)

              return (
                <label
                  key={promotion.id}
                  className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => togglePromotion(promotion)}
                    className="mt-0.5 size-4 rounded border-neutral-600 bg-neutral-950"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-neutral-200">{promotion.name}</span>
                    <span className="block text-xs text-neutral-500">
                      {promotion.bundle_qty} × {formatCurrency(promotion.fixed_price)} ·{' '}
                      {promotion.applies_to === 'alcoholic'
                        ? 'Con alcohol'
                        : promotion.applies_to === 'non_alcoholic'
                          ? 'Sin alcohol'
                          : 'Cualquier bebida'}
                      {' · '}
                      {promotion.applies_to_tier === 'any'
                        ? 'Cualquier tier'
                        : promotion.applies_to_tier === 'premium'
                          ? 'Premium'
                          : 'Normal'}
                    </span>
                    {selected && !applied ? (
                      <span className="mt-1 block text-[11px] text-amber-300">
                        No hay suficientes bebidas elegibles para aplicar esta promoción.
                      </span>
                    ) : null}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">Cobro</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="paymentMethod" className="mb-1.5 block text-sm text-neutral-300">
              Método de pago
            </label>
            <select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            >
              {Object.entries(paymentMethodLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="paymentReference" className="mb-1.5 block text-sm text-neutral-300">
              Referencia
            </label>
            <input
              id="paymentReference"
              type="text"
              placeholder="Opcional"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
            />
          </div>
        </div>

        <div>
          <label htmlFor="saleNotes" className="mb-1.5 block text-sm text-neutral-300">
            Notas
          </label>
          <textarea
            id="saleNotes"
            rows={2}
            placeholder="Opcional"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
          />
        </div>

        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={previewQuery.isFetching || createMutation.isPending || cart.length === 0}
          className="w-full rounded-xl bg-brand-400 px-4 py-3.5 text-base font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createMutation.isPending ? 'Procesando…' : `Cobrar ${formatCurrency(total)}`}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Ventas recientes</h2>

        {ordersQuery.data?.length === 0 ? (
          <p className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
            Aún no hay ventas.
          </p>
        ) : null}

        {ordersQuery.data?.map((order) => (
          <Link
            key={order.id}
            to={`/pedidos/${order.id}`}
            className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-600"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{order.folio}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {formatDateTime(order.sold_at)} · {order.item_count}{' '}
                  {order.item_count === 1 ? 'artículo' : 'artículos'}
                  {order.payment_methods ? ` · ${order.payment_methods}` : ''}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold">{formatCurrency(order.total)}</p>
            </div>
            {order.warning_count > 0 ? (
              <span className="mt-2 inline-flex rounded-full bg-amber-500/15 px-2 py-1 text-[11px] text-amber-300">
                {order.warning_count} advertencia{order.warning_count === 1 ? '' : 's'}
              </span>
            ) : null}
          </Link>
        ))}
      </section>

      {showWarnings ? (
        <div className="fixed inset-0 z-50 flex items-end bg-neutral-950/80 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-neutral-900 p-4 shadow-2xl">
            <h2 className="font-semibold text-amber-200">Inventario insuficiente</h2>
            <p className="mt-1 text-sm text-neutral-400">
              La venta se puede continuar. El inventario faltante quedará negativo.
            </p>

            <ul className="mt-3 space-y-2 text-sm text-neutral-300">
              {warnings.map((warning, index) => (
                <li key={`${warning.type}-${index}`} className="rounded-xl bg-neutral-950 p-3">
                  {warningText(warning)}
                </li>
              ))}
            </ul>

            {createMutation.isError ? (
              <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {createMutation.error.message}
              </p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void completeSale()}
                disabled={createMutation.isPending}
                className="flex-1 rounded-xl bg-brand-400 px-3 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-60"
              >
                {createMutation.isPending ? 'Cobrando…' : 'Continuar venta'}
              </button>
              <button
                type="button"
                onClick={() => setShowWarnings(false)}
                disabled={createMutation.isPending}
                className="flex-1 rounded-xl border border-neutral-700 px-3 py-3 text-sm text-neutral-300 disabled:opacity-60"
              >
                Revisar carrito
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
