import { useState } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { formDraftKey } from '@/lib/form-drafts'
import { formatCurrency } from '@/lib/format'
import { useDraftState } from '@/lib/use-draft-state'
import type { EventProduct, EventView, PaymentMethod } from '@/types/database'
import { eventPaymentMethodLabels } from './event-labels'
import { isConnectivityError } from './connectivity'
import {
  EVENT_SALE_MAX_LINE_QTY,
  EVENT_SALE_MAX_TOTAL_UNITS,
  calculateEventSaleTotals,
  eventSaleLineTotal,
  type EventSaleLineInput,
} from './event-pricing'
import { eventSaleFormSchema } from './event-schemas'
import { createClientId, enqueueEventSale } from './offline-queue'
import { createEventSale } from './queries'

type EventSaleDraft = {
  lines: EventSaleLineInput[]
  applyPromotion: boolean
  paymentMethod: PaymentMethod
  notes: string
}

const emptyDraft: EventSaleDraft = {
  lines: [],
  applyPromotion: true,
  paymentMethod: 'cash',
  notes: '',
}

type EventSaleFormProps = {
  event: EventView
  products: EventProduct[]
  online: boolean
  onSaleSaved: (pending: boolean) => void
}

export function EventSaleForm({ event, products, online, onSaleSaved }: EventSaleFormProps) {
  const { profile } = useAuth()
  const userId = profile?.id ?? null
  const storageKey = userId ? formDraftKey('event-sale', userId, event.id) : null
  const [initialDraft] = useState<EventSaleDraft>(() => ({
    ...emptyDraft,
    applyPromotion: event.promotion_enabled,
  }))
  const {
    value: draft,
    setValue: setDraft,
    restored,
    discard,
  } = useDraftState<EventSaleDraft>({
    storageKey,
    initialValue: initialDraft,
  })

  const [search, setSearch] = useState('')
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const totals = calculateEventSaleTotals(draft.lines, {
    enabled: event.promotion_enabled && draft.applyPromotion,
    bundleQty: event.bundle_qty,
    bundlePrice: event.bundle_price,
  })

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  function addProduct(product: EventProduct) {
    setMessage(null)
    setError(null)
    const existing = draft.lines.find((line) => line.productId === product.id)
    const totalUnits = draft.lines.reduce((sum, line) => sum + line.quantity, 0)

    if (existing && existing.quantity >= EVENT_SALE_MAX_LINE_QTY) {
      setError(`Máximo ${EVENT_SALE_MAX_LINE_QTY} unidades por bebida.`)
      return
    }

    if (totalUnits >= EVENT_SALE_MAX_TOTAL_UNITS) {
      setError(`Máximo ${EVENT_SALE_MAX_TOTAL_UNITS} bebidas por venta.`)
      return
    }

    setDraft((current) => {
      const currentLine = current.lines.find((line) => line.productId === product.id)

      if (currentLine) {
        return {
          ...current,
          lines: current.lines.map((line) =>
            line === currentLine ? { ...line, quantity: line.quantity + 1 } : line,
          ),
        }
      }

      return {
        ...current,
        lines: [
          ...current.lines,
          {
            productId: product.id,
            productName: product.name,
            quantity: 1,
            unitPrice: product.price,
            promotionEligible: product.kind === 'preparado',
          },
        ],
      }
    })
  }

  function addCustomLine() {
    const name = customName.trim()
    const price = Number(customPrice)

    if (!name) {
      setError('Escribe el nombre del concepto.')
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      setError('El precio del concepto es inválido.')
      return
    }

    const totalUnits = draft.lines.reduce((sum, line) => sum + line.quantity, 0)

    if (totalUnits >= EVENT_SALE_MAX_TOTAL_UNITS) {
      setError(`Máximo ${EVENT_SALE_MAX_TOTAL_UNITS} bebidas por venta.`)
      return
    }

    setError(null)
    setMessage(null)
    setDraft((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          productId: null,
          productName: name,
          quantity: 1,
          unitPrice: Math.round(price * 100) / 100,
          promotionEligible: true,
        },
      ],
    }))
    setCustomName('')
    setCustomPrice('')
  }

  function updateLine(index: number, patch: Partial<EventSaleLineInput>) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    }))
  }

  function removeLine(index: number) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
    }))
  }

  async function submitSale() {
    setError(null)
    setMessage(null)

    const applyPromotion = event.promotion_enabled && draft.applyPromotion
    const candidate = {
      items: draft.lines,
      applyPromotion,
      paymentMethod: draft.paymentMethod,
      notes: draft.notes,
    }
    const validation = eventSaleFormSchema.safeParse(candidate)

    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Revisa la venta.')
      return
    }

    setSubmitting(true)

    const clientId = createClientId()
    const input = {
      clientId,
      eventId: event.id,
      items: draft.lines,
      applyPromotion,
      bundleQty: event.bundle_qty,
      bundlePrice: event.bundle_price,
      paymentMethod: draft.paymentMethod,
      notes: draft.notes,
      soldAt: new Date().toISOString(),
    }

    try {
      if (!userId) {
        throw new Error('La sesión no está disponible. Vuelve a iniciar sesión.')
      }

      if (online) {
        await createEventSale(input)
        discard()
        setMessage('Venta registrada.')
        onSaleSaved(false)
        return
      }

      enqueueEventSale(userId, input)
      discard()
      setMessage('Venta guardada sin conexión. Se sincronizará al recuperar señal.')
      onSaleSaved(true)
    } catch (submitError) {
      if (isConnectivityError(submitError) && userId) {
        try {
          enqueueEventSale(userId, input)
          discard()
          setMessage('Venta guardada sin conexión. Se sincronizará al recuperar señal.')
          onSaleSaved(true)
        } catch (queueError) {
          setError(
            queueError instanceof Error
              ? queueError.message
              : 'No se pudo guardar la venta en el teléfono.',
          )
        }
        return
      }

      setError(
        submitError instanceof Error ? submitError.message : 'No se pudo registrar la venta.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div>
        <h2 className="font-semibold">Registrar venta</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Toca un producto para agregarlo. Puedes cambiar el precio de cada bebida.
        </p>
      </div>

      {restored ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-400/40 bg-brand-400/10 p-3 text-sm">
          <p className="text-brand-100">Venta sin terminar restaurada.</p>
          <button
            type="button"
            onClick={discard}
            className="shrink-0 rounded-lg border border-brand-400/40 px-2 py-1 text-xs text-brand-200"
          >
            Descartar
          </button>
        </div>
      ) : null}

      <div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar producto"
          className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none transition focus:border-brand-400"
        />
      </div>

      {products.length === 0 ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          No hay catálogo guardado. Puedes agregar conceptos manuales.
        </p>
      ) : (
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => addProduct(product)}
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-left transition hover:border-brand-400"
            >
              <span className="block truncate text-sm font-medium text-neutral-200">
                {product.name}
              </span>
              <span className="mt-0.5 block text-xs text-neutral-500">
                {formatCurrency(product.price)}
              </span>
            </button>
          ))}
        </div>
      )}

      <details className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
        <summary className="cursor-pointer text-sm text-neutral-300">Concepto libre</summary>
        <div className="mt-3 grid grid-cols-[1fr_7rem] gap-2">
          <input
            type="text"
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            placeholder="Nombre"
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={customPrice}
            onChange={(event) => setCustomPrice(event.target.value)}
            placeholder="Precio"
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
          />
        </div>
        <button
          type="button"
          onClick={addCustomLine}
          className="mt-2 rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-200"
        >
          Agregar concepto
        </button>
      </details>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-neutral-300">Carrito</h3>
          <p className="text-xs text-neutral-500">
            {draft.lines.length} {draft.lines.length === 1 ? 'línea' : 'líneas'}
          </p>
        </div>

        {draft.lines.length === 0 ? (
          <p className="text-sm text-neutral-500">Agrega al menos una bebida.</p>
        ) : null}

        {draft.lines.map((line, index) => (
          <div
            key={`${line.productId ?? line.productName}-${index}`}
            className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium text-neutral-200">
                {line.productName}
              </p>
              <p className="shrink-0 text-sm font-semibold">
                {formatCurrency(eventSaleLineTotal(line))}
              </p>
            </div>

            <div className="grid grid-cols-[auto_5.5rem_1fr] items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateLine(index, { quantity: Math.max(1, line.quantity - 1) })}
                  className="size-8 rounded-lg border border-neutral-700 text-neutral-300"
                >
                  -
                </button>
                <span className="min-w-6 text-center text-sm">{line.quantity}</span>
                <button
                  type="button"
                  onClick={() => updateLine(index, { quantity: line.quantity + 1 })}
                  disabled={line.quantity >= EVENT_SALE_MAX_LINE_QTY}
                  className="size-8 rounded-lg border border-neutral-700 text-neutral-300 disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.unitPrice}
                onChange={(event) =>
                  updateLine(index, {
                    unitPrice: Number(event.target.value) || 0,
                  })
                }
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-right text-sm text-neutral-100 outline-none focus:border-brand-400"
              />
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1 text-[11px] text-neutral-500">
                  <input
                    type="checkbox"
                    checked={line.promotionEligible}
                    onChange={(event) =>
                      updateLine(index, { promotionEligible: event.target.checked })
                    }
                    className="size-3.5 rounded border-neutral-600 bg-neutral-950"
                  />
                  Promo
                </label>
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  className="text-xs text-red-300"
                >
                  Quitar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm">
        <div className="flex justify-between gap-3 text-neutral-400">
          <span>Subtotal</span>
          <span>{formatCurrency(totals.grossTotal)}</span>
        </div>
        {totals.discountTotal > 0 ? (
          <div className="flex justify-between gap-3 text-green-300">
            <span>Descuento promoción</span>
            <span>-{formatCurrency(totals.discountTotal)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 text-base font-semibold">
          <span>Total</span>
          <span>{formatCurrency(totals.total)}</span>
        </div>
        {event.promotion_enabled ? (
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={draft.applyPromotion}
              onChange={(changeEvent) =>
                setDraft((current) => ({
                  ...current,
                  applyPromotion: changeEvent.target.checked,
                }))
              }
              className="size-4 rounded border-neutral-600 bg-neutral-950"
            />
            Aplicar {event.bundle_qty} x {formatCurrency(event.bundle_price)}
          </label>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="eventSalePayment" className="mb-1.5 block text-sm text-neutral-300">
            Pago
          </label>
          <select
            id="eventSalePayment"
            value={draft.paymentMethod}
            onChange={(changeEvent) =>
              setDraft((current) => ({
                ...current,
                paymentMethod: changeEvent.target.value as PaymentMethod,
              }))
            }
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none focus:border-brand-400"
          >
            {Object.entries(eventPaymentMethodLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="eventSaleNotes" className="mb-1.5 block text-sm text-neutral-300">
            Notas
          </label>
          <input
            id="eventSaleNotes"
            type="text"
            value={draft.notes}
            onChange={(changeEvent) =>
              setDraft((current) => ({ ...current, notes: changeEvent.target.value }))
            }
            placeholder="Opcional"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none focus:border-brand-400"
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {message ? (
        <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
          {message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void submitSale()}
        disabled={submitting || draft.lines.length === 0}
        className="w-full rounded-xl bg-brand-400 px-4 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:opacity-60"
      >
        {submitting ? 'Registrando…' : 'Registrar venta'}
      </button>
    </section>
  )
}
