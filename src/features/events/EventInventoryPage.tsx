import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { fetchInventoryItems } from '@/features/catalog/queries'
import { formatDateTime, formatQty } from '@/features/inventory/inventory-utils'
import { formatCurrency, formatUnitCost } from '@/lib/format'
import { useOnlineStatus } from '@/lib/use-online-status'
import type {
  EventInventoryMovementType,
  EventInventoryStock,
  InventoryItemView,
} from '@/types/database'
import { useEventSync } from './event-sync-context'
import { eventPaymentMethodLabels, eventStatusLabels, expenseCategoryLabels } from './event-labels'
import {
  eventInventoryAdjustSchema,
  eventInventoryLoadFormSchema,
  eventInventoryTransferSchema,
  type EventInventoryLoadForm,
} from './event-schemas'
import { createClientId } from './offline-queue'
import {
  adjustEventInventoryItem,
  createEventInventoryLoad,
  fetchEventBundle,
  fetchEventInventory,
  transferEventInventoryToGeneral,
} from './queries'

const movementLabels: Record<EventInventoryMovementType, string> = {
  purchase: 'Carga',
  consumption: 'Consumo',
  transfer_out: 'Traspaso',
  adjustment: 'Ajuste',
  waste: 'Merma',
}

const defaultLoadValues: EventInventoryLoadForm = {
  items: [{ itemId: '', qtyPurchase: 1, purchaseFactor: 1, totalCost: 0 }],
  category: 'supplies',
  paymentMethod: 'cash',
  reference: '',
  notes: '',
}

function itemPurchaseLabel(item: InventoryItemView | undefined) {
  if (!item) return ''

  return `${item.purchase_unit} × ${item.purchase_factor} ${item.base_unit}`
}

export function EventInventoryPage() {
  const { id } = useParams<{ id: string }>()
  const eventId = id ?? ''
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const userId = profile?.id ?? null
  const online = useOnlineStatus()
  const canOperate = profile?.role === 'admin' || profile?.role === 'operador'
  const { pendingSales } = useEventSync()

  const eventQuery = useQuery({
    queryKey: ['event_bundle', eventId],
    queryFn: () => fetchEventBundle(userId!, eventId),
    enabled: Boolean(userId && eventId),
  })

  const itemsQuery = useQuery({
    queryKey: ['inventory_items'],
    queryFn: fetchInventoryItems,
    enabled: canOperate,
  })

  const inventoryQuery = useQuery({
    queryKey: ['event_inventory', eventId],
    queryFn: () => fetchEventInventory(eventId),
    enabled: Boolean(eventId && online),
  })

  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadMessage, setLoadMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionItemId, setActionItemId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<'adjust' | 'transfer' | null>(null)
  const [actionQty, setActionQty] = useState('')
  const [actionNotes, setActionNotes] = useState('')

  const {
    control,
    register,
    setValue,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EventInventoryLoadForm>({
    resolver: zodResolver(eventInventoryLoadFormSchema),
    defaultValues: defaultLoadValues,
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = useWatch({ control, name: 'items' }) ?? []

  const event = eventQuery.data?.event
  const stock = inventoryQuery.data?.stock ?? []
  const loads = inventoryQuery.data?.loads ?? []
  const movements = inventoryQuery.data?.movements ?? []
  const eventPendingSales = pendingSales.filter((sale) => sale.eventId === eventId)
  const hasPendingSales = eventPendingSales.length > 0
  const canTransfer = canOperate && online && event?.status === 'closed' && !hasPendingSales

  const stockableItems = (itemsQuery.data ?? [])
    .filter((item) => item.active)
    .sort((a, b) => a.name.localeCompare(b.name))
  const itemById = new Map(stockableItems.map((item) => [item.id, item]))
  const loadTotal = watchedItems.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0)

  function invalidateInventory() {
    void queryClient.invalidateQueries({ queryKey: ['event_inventory', eventId] })
    void queryClient.invalidateQueries({ queryKey: ['event_bundle', eventId] })
    void queryClient.invalidateQueries({ queryKey: ['events'] })
    void queryClient.invalidateQueries({ queryKey: ['inventory_stock'] })
    void queryClient.invalidateQueries({ queryKey: ['inventory_movements'] })
  }

  const loadMutation = useMutation({
    mutationFn: (values: EventInventoryLoadForm) =>
      createEventInventoryLoad({
        clientId: createClientId(),
        eventId,
        items: values.items.map((item) => ({
          itemId: item.itemId,
          qtyPurchase: item.qtyPurchase,
          purchaseFactor: item.purchaseFactor,
          totalCost: item.totalCost,
        })),
        category: values.category,
        paymentMethod: values.paymentMethod,
        reference: values.reference,
        notes: values.notes,
      }),
    onSuccess: () => {
      setLoadError(null)
      setLoadMessage('Carga registrada. El gasto se agregó automáticamente al evento.')
      reset(defaultLoadValues)
      invalidateInventory()
    },
    onError: (error) => {
      setLoadMessage(null)
      setLoadError(error.message)
    },
  })

  const adjustMutation = useMutation({
    mutationFn: (input: { itemId: string; countedQtyBase: number; notes: string }) =>
      adjustEventInventoryItem({ eventId, ...input }),
    onSuccess: () => {
      setActionError(null)
      closeAction()
      invalidateInventory()
    },
    onError: (error) => setActionError(error.message),
  })

  const transferMutation = useMutation({
    mutationFn: (input: { itemId: string; qtyBase: number; notes: string }) =>
      transferEventInventoryToGeneral({ eventId, ...input }),
    onSuccess: () => {
      setActionError(null)
      closeAction()
      invalidateInventory()
    },
    onError: (error) => setActionError(error.message),
  })

  function closeAction() {
    setActionItemId(null)
    setActionType(null)
    setActionQty('')
    setActionNotes('')
  }

  function startAction(item: EventInventoryStock, type: 'adjust' | 'transfer') {
    setActionError(null)
    setActionItemId(item.item_id)
    setActionType(type)
    setActionQty(type === 'adjust' ? String(item.current_qty_base) : '')
    setActionNotes('')
  }

  function submitAction(item: EventInventoryStock) {
    setActionError(null)

    if (actionType === 'adjust') {
      const validation = eventInventoryAdjustSchema.safeParse({
        countedQtyBase: Number(actionQty),
        notes: actionNotes,
      })

      if (!validation.success) {
        setActionError(validation.error.issues[0]?.message ?? 'Revisa el conteo.')
        return
      }

      adjustMutation.mutate({
        itemId: item.item_id,
        countedQtyBase: validation.data.countedQtyBase,
        notes: validation.data.notes,
      })
      return
    }

    if (actionType === 'transfer') {
      if (!canTransfer || item.current_qty_base <= 0) {
        setActionError('No puedes transferir sobrantes en este momento.')
        return
      }

      const validation = eventInventoryTransferSchema.safeParse({
        qtyBase: Number(actionQty),
        notes: actionNotes,
      })

      if (!validation.success) {
        setActionError(validation.error.issues[0]?.message ?? 'Revisa la cantidad.')
        return
      }

      if (validation.data.qtyBase > item.current_qty_base) {
        setActionError('No puedes transferir más de lo disponible.')
        return
      }

      transferMutation.mutate({
        itemId: item.item_id,
        qtyBase: validation.data.qtyBase,
        notes: validation.data.notes,
      })
    }
  }

  if (!eventId || !userId) {
    return <p className="text-sm text-red-300">Evento no disponible.</p>
  }

  if (eventQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando evento…</p>
  }

  if (eventQuery.isError || !event) {
    return (
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h1 className="font-semibold">Evento no disponible</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {eventQuery.error?.message ?? 'No se encontró el evento.'}
        </p>
        <Link to="/eventos" className="mt-4 inline-flex text-sm text-neutral-300 underline">
          Volver a eventos
        </Link>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-neutral-500">{event.folio}</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">
            Inventario del evento
          </h1>
          <p className="mt-1 text-sm text-neutral-400">{event.name}</p>
        </div>
        <Link
          to={`/eventos/${event.id}`}
          className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300"
        >
          Volver
        </Link>
      </section>

      <section className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2 py-1 ${
            event.status === 'open'
              ? 'bg-green-500/15 text-green-300'
              : 'bg-neutral-700/50 text-neutral-300'
          }`}
        >
          {eventStatusLabels[event.status]}
        </span>
        {hasPendingSales ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-200">
            {eventPendingSales.length} venta(s) pendiente(s) de sincronizar
          </span>
        ) : null}
      </section>

      {!online ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Conéctate a internet para cargar, ajustar o transferir inventario del evento.
        </p>
      ) : null}

      {event.status !== 'closed' ? (
        <p className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-400">
          Cierra el evento para habilitar el traspaso de sobrantes al inventario general.
        </p>
      ) : null}

      {hasPendingSales ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Sincroniza las ventas pendientes antes de cerrar o transferir sobrantes.
        </p>
      ) : null}

      {canOperate ? (
        <form
          className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          onSubmit={handleSubmit((values) => loadMutation.mutate(values))}
          noValidate
        >
          <div>
            <h2 className="font-semibold">Cargar insumos al evento</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Registra lo que compras para el evento. Se creará un gasto automático por el total.
            </p>
          </div>

          {itemsQuery.isLoading ? (
            <p className="text-sm text-neutral-500">Cargando catálogo de insumos…</p>
          ) : null}

          <div className="space-y-3">
            {fields.map((field, index) => {
              const item = itemById.get(watchedItems[index]?.itemId ?? '')
              const lineTotal = Number(watchedItems[index]?.totalCost) || 0

              return (
                <div
                  key={field.id}
                  className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                >
                  <div>
                    <label
                      htmlFor={`inventory-item-${index}`}
                      className="mb-1.5 block text-xs text-neutral-400"
                    >
                      Insumo
                    </label>
                    <select
                      id={`inventory-item-${index}`}
                      {...register(`items.${index}.itemId`, {
                        onChange: (event) => {
                          const selected = itemById.get(event.target.value)
                          if (selected) {
                            setValue(`items.${index}.purchaseFactor`, selected.purchase_factor, {
                              shouldValidate: true,
                            })
                          }
                        },
                      })}
                      className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
                    >
                      <option value="">Selecciona un insumo</option>
                      {stockableItems.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name} · {option.group_name}
                        </option>
                      ))}
                    </select>
                    {errors.items?.[index]?.itemId ? (
                      <p className="mt-1 text-xs text-red-300">
                        {errors.items[index]?.itemId?.message}
                      </p>
                    ) : null}
                    {item ? (
                      <p className="mt-1 text-[11px] text-neutral-500">
                        Compra: {itemPurchaseLabel(item)}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor={`inventory-qty-${index}`}
                        className="mb-1.5 block text-xs text-neutral-400"
                      >
                        Cantidad de compra
                      </label>
                      <input
                        id={`inventory-qty-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        {...register(`items.${index}.qtyPurchase`, { valueAsNumber: true })}
                        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
                      />
                      {errors.items?.[index]?.qtyPurchase ? (
                        <p className="mt-1 text-xs text-red-300">
                          {errors.items[index]?.qtyPurchase?.message}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label
                        htmlFor={`inventory-cost-${index}`}
                        className="mb-1.5 block text-xs text-neutral-400"
                      >
                        Costo total
                      </label>
                      <input
                        id={`inventory-cost-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        {...register(`items.${index}.totalCost`, { valueAsNumber: true })}
                        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
                      />
                      {errors.items?.[index]?.totalCost ? (
                        <p className="mt-1 text-xs text-red-300">
                          {errors.items[index]?.totalCost?.message}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={`inventory-content-${index}`}
                      className="mb-1.5 block text-xs text-neutral-400"
                    >
                      Contenido por unidad ({item?.base_unit ?? 'base'})
                    </label>
                    <input
                      id={`inventory-content-${index}`}
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      {...register(`items.${index}.purchaseFactor`, { valueAsNumber: true })}
                      className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
                    />
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Ej. caja de 1 L = 1000 ml. Si lo dejas vacío, se usa el contenido del insumo.
                    </p>
                    {errors.items?.[index]?.purchaseFactor ? (
                      <p className="mt-1 text-xs text-red-300">
                        {errors.items[index]?.purchaseFactor?.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
                    <span>Línea: {formatCurrency(lineTotal)}</span>
                    {fields.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="text-red-300 underline"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          {errors.items?.message ? (
            <p className="text-xs text-red-300">{errors.items.message}</p>
          ) : null}

          <button
            type="button"
            onClick={() => append({ itemId: '', qtyPurchase: 1, purchaseFactor: 1, totalCost: 0 })}
            className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-200"
          >
            Agregar insumo
          </button>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="loadCategory" className="mb-1.5 block text-xs text-neutral-400">
                Categoría del gasto
              </label>
              <select
                id="loadCategory"
                {...register('category')}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
              >
                {Object.entries(expenseCategoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="loadPayment" className="mb-1.5 block text-xs text-neutral-400">
                Pago
              </label>
              <select
                id="loadPayment"
                {...register('paymentMethod')}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
              >
                {Object.entries(eventPaymentMethodLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="loadReference" className="mb-1.5 block text-xs text-neutral-400">
              Referencia
            </label>
            <input
              id="loadReference"
              type="text"
              placeholder="Opcional"
              {...register('reference')}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
            />
          </div>

          <div>
            <label htmlFor="loadNotes" className="mb-1.5 block text-xs text-neutral-400">
              Notas
            </label>
            <textarea
              id="loadNotes"
              rows={2}
              placeholder="Opcional"
              {...register('notes')}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-neutral-400">Total de la carga</span>
            <span className="font-semibold">{formatCurrency(loadTotal)}</span>
          </div>

          {loadError ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {loadError}
            </p>
          ) : null}

          {loadMessage ? (
            <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
              {loadMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || loadMutation.isPending || !online}
            className="w-full rounded-xl bg-brand-400 px-4 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:opacity-60"
          >
            {loadMutation.isPending ? 'Registrando…' : 'Registrar carga'}
          </button>
        </form>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-semibold">Stock del evento</h2>
          <p className="text-xs text-neutral-500">{stock.length} insumos</p>
        </div>

        {inventoryQuery.isLoading ? (
          <p className="text-sm text-neutral-500">Cargando inventario…</p>
        ) : null}

        {inventoryQuery.isError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {inventoryQuery.error.message}
          </p>
        ) : null}

        {!inventoryQuery.isLoading && !inventoryQuery.isError && stock.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Todavía no hay insumos cargados para este evento.
          </p>
        ) : null}

        {stock.map((item) => (
          <article
            key={item.item_id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.item_name}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {item.group_name} · {formatUnitCost(item.avg_unit_cost)}/{item.base_unit}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`text-lg font-semibold ${
                    item.current_qty_base < 0 ? 'text-red-300' : 'text-neutral-100'
                  }`}
                >
                  {formatQty(item.current_qty_base, item.base_unit)}
                </p>
                <p className="text-[11px] text-neutral-500">
                  Valor {formatCurrency(item.stock_value)}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-neutral-500">
              <span>Cargado: {formatQty(item.purchased_base, item.base_unit)}</span>
              <span>Consumido: {formatQty(item.consumed_base, item.base_unit)}</span>
              <span>Transferido: {formatQty(item.transferred_base, item.base_unit)}</span>
              <span>Ajustes: {formatQty(item.adjusted_base, item.base_unit)}</span>
            </div>

            {canOperate ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startAction(item, 'adjust')}
                  className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-300"
                >
                  Ajustar conteo
                </button>
                <button
                  type="button"
                  onClick={() => startAction(item, 'transfer')}
                  disabled={!canTransfer || !item.track_stock || item.current_qty_base <= 0}
                  className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-300 disabled:opacity-40"
                  title={!item.track_stock ? 'Este insumo no lleva inventario general' : undefined}
                >
                  Transferir sobrante
                </button>
              </div>
            ) : null}

            {actionItemId === item.item_id && actionType ? (
              <div className="mt-3 space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                <p className="text-xs font-medium text-neutral-300">
                  {actionType === 'adjust' ? 'Conteo físico' : 'Transferir al inventario general'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor={`action-qty-${item.item_id}`}
                      className="mb-1 block text-[11px] text-neutral-500"
                    >
                      {actionType === 'adjust'
                        ? `Cantidad contada (${item.base_unit})`
                        : `Cantidad a transferir (${item.base_unit})`}
                    </label>
                    <input
                      id={`action-qty-${item.item_id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={actionQty}
                      onChange={(event) => setActionQty(event.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-brand-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`action-notes-${item.item_id}`}
                      className="mb-1 block text-[11px] text-neutral-500"
                    >
                      Notas
                    </label>
                    <input
                      id={`action-notes-${item.item_id}`}
                      type="text"
                      value={actionNotes}
                      onChange={(event) => setActionNotes(event.target.value)}
                      placeholder="Opcional"
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-brand-400"
                    />
                  </div>
                </div>
                {actionError ? <p className="text-xs text-red-300">{actionError}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => submitAction(item)}
                    disabled={adjustMutation.isPending || transferMutation.isPending}
                    className="rounded-lg bg-brand-400 px-3 py-1.5 text-xs font-semibold text-neutral-950 disabled:opacity-60"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={closeAction}
                    className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Cargas</h2>
        {loads.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay cargas registradas.</p>
        ) : null}
        {loads.map((load) => (
          <article
            key={load.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{expenseCategoryLabels[load.category]}</p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {formatDateTime(load.created_at)} ·{' '}
                  {eventPaymentMethodLabels[load.payment_method]}
                  {load.created_by_name ? ` · ${load.created_by_name}` : ''}
                </p>
              </div>
              <p className="font-semibold">{formatCurrency(load.total_cost)}</p>
            </div>
            {load.reference || load.notes ? (
              <p className="mt-2 text-xs text-neutral-500">
                {[load.reference, load.notes].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Movimientos recientes</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay movimientos.</p>
        ) : null}
        {movements.map((movement) => (
          <article
            key={movement.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {movementLabels[movement.movement_type]} · {movement.item_name}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {formatDateTime(movement.occurred_at)}
                  {movement.created_by_name ? ` · ${movement.created_by_name}` : ''}
                </p>
              </div>
              <p
                className={`font-semibold ${
                  movement.qty_base < 0 ? 'text-red-300' : 'text-green-300'
                }`}
              >
                {formatQty(movement.qty_base, movement.base_unit)}
              </p>
            </div>
            {movement.notes ? (
              <p className="mt-2 text-xs text-neutral-500">{movement.notes}</p>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  )
}
