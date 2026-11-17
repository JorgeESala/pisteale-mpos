import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { formatQty } from '@/features/inventory/inventory-utils'
import { formatCurrency } from '@/lib/format'
import { useOnlineStatus } from '@/lib/use-online-status'
import type { EventInventoryStock, EventLeftoverCountView, EventView } from '@/types/database'
import { fetchEventBundle, saveEventLeftoverCounts } from './queries'

type CountRow = {
  itemId: string
  itemName: string
  groupName: string
  baseUnit: string
  purchaseUnit: string
  purchaseFactor: number
  unitCost: number
  systemQty: number
  systemValue: number
  quantity: string
  unit: string
  unitFactor: string
  notes: string
}

function rowsFromData(
  inventory: EventInventoryStock[],
  counts: EventLeftoverCountView[],
): CountRow[] {
  const byItem = new Map(counts.map((count) => [count.item_id, count]))

  return inventory.map((item) => {
    const count = byItem.get(item.item_id)
    const unit = count?.unit ?? item.base_unit
    const factor = count?.unit_factor ?? (unit === item.base_unit ? 1 : item.purchase_factor)

    return {
      itemId: item.item_id,
      itemName: item.item_name,
      groupName: item.group_name,
      baseUnit: item.base_unit,
      purchaseUnit: item.purchase_unit,
      purchaseFactor: item.purchase_factor,
      unitCost: item.avg_unit_cost,
      systemQty: item.current_qty_base,
      systemValue: item.stock_value,
      quantity: String(count?.quantity ?? 0),
      unit,
      unitFactor: String(factor),
      notes: count?.notes ?? '',
    }
  })
}

function unitOptions(row: CountRow) {
  const options = [{ value: row.baseUnit, label: row.baseUnit }]

  if (row.purchaseUnit && row.purchaseUnit !== row.baseUnit) {
    options.push({
      value: row.purchaseUnit,
      label: `${row.purchaseUnit} (${formatQty(row.purchaseFactor, row.baseUnit)})`,
    })
  }

  return options
}

function rowValue(row: CountRow) {
  const quantity = Number(row.quantity)
  const factor = row.unit === row.baseUnit ? 1 : Number(row.unitFactor)

  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(factor) || factor <= 0) {
    return 0
  }

  return Math.round(quantity * factor * row.unitCost * 100) / 100
}

type EventLeftoverFormProps = {
  event: EventView
  inventory: EventInventoryStock[]
  counts: EventLeftoverCountView[]
  online: boolean
  onSaved: () => void
}

function EventLeftoverForm({ event, inventory, counts, online, onSaved }: EventLeftoverFormProps) {
  const [rows, setRows] = useState(() => rowsFromData(inventory, counts))
  const [error, setError] = useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const items = rows.map((row) => {
        const quantity = Number(row.quantity)
        const factor = row.unit === row.baseUnit ? 1 : Number(row.unitFactor)

        if (!Number.isFinite(quantity) || quantity < 0) {
          throw new Error(`Cantidad inválida para ${row.itemName}.`)
        }

        if (!Number.isFinite(factor) || factor <= 0) {
          throw new Error(`Contenido inválido para ${row.itemName}.`)
        }

        return {
          itemId: row.itemId,
          quantity,
          unit: row.unit,
          unitFactor: factor,
          notes: row.notes,
        }
      })

      await saveEventLeftoverCounts({ eventId: event.id, items })
    },
    onSuccess: () => {
      setError(null)
      onSaved()
    },
    onError: (saveError) => {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el conteo.')
    },
  })

  function updateRow(itemId: string, patch: Partial<CountRow>) {
    setRows((current) => current.map((row) => (row.itemId === itemId ? { ...row, ...patch } : row)))
  }

  function changeUnit(row: CountRow, unit: string) {
    const factor =
      unit === row.baseUnit
        ? '1'
        : row.unit === row.purchaseUnit
          ? row.unitFactor
          : String(row.purchaseFactor)

    updateRow(row.itemId, { unit, unitFactor: factor })
  }

  const total = rows.reduce((sum, row) => sum + rowValue(row), 0)

  return (
    <section className="space-y-3">
      {rows.map((row) => {
        const value = rowValue(row)
        const options = unitOptions(row)

        return (
          <article
            key={row.itemId}
            className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div>
              <p className="font-semibold">{row.itemName}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{row.groupName}</p>
              <p className="mt-1 text-[11px] text-neutral-500">
                Referencia del sistema: {formatQty(row.systemQty, row.baseUnit)} ·{' '}
                {formatCurrency(row.systemValue)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor={`leftover-qty-${row.itemId}`}
                  className="mb-1 block text-xs text-neutral-400"
                >
                  Sobró
                </label>
                <input
                  id={`leftover-qty-${row.itemId}`}
                  type="number"
                  min="0"
                  step="0.0001"
                  value={row.quantity}
                  onChange={(changeEvent) =>
                    updateRow(row.itemId, { quantity: changeEvent.target.value })
                  }
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
                />
              </div>
              <div>
                <label
                  htmlFor={`leftover-unit-${row.itemId}`}
                  className="mb-1 block text-xs text-neutral-400"
                >
                  Unidad
                </label>
                <select
                  id={`leftover-unit-${row.itemId}`}
                  value={row.unit}
                  onChange={(changeEvent) => changeUnit(row, changeEvent.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
                >
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {row.unit !== row.baseUnit ? (
              <div>
                <label
                  htmlFor={`leftover-factor-${row.itemId}`}
                  className="mb-1 block text-xs text-neutral-400"
                >
                  Contenido por {row.unit} ({row.baseUnit})
                </label>
                <input
                  id={`leftover-factor-${row.itemId}`}
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={row.unitFactor}
                  onChange={(changeEvent) =>
                    updateRow(row.itemId, { unitFactor: changeEvent.target.value })
                  }
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-brand-400"
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-neutral-500">
                Costo: {formatCurrency(row.unitCost)}/{row.baseUnit}
              </span>
              <span className="font-semibold text-green-200">{formatCurrency(value)}</span>
            </div>
          </article>
        )
      })}

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div>
          <p className="text-xs text-neutral-500">Sobrante registrado</p>
          <p className="text-xl font-semibold text-green-200">{formatCurrency(total)}</p>
          <p className="mt-1 text-[11px] text-neutral-500">
            {event.leftover_count_complete ? 'Conteo completo' : 'Conteo pendiente'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={!online || saveMutation.isPending}
          className="rounded-xl bg-brand-400 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-60"
        >
          {saveMutation.isPending ? 'Guardando…' : 'Guardar conteo'}
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </section>
  )
}

export function EventLeftoverPage() {
  const { id } = useParams<{ id: string }>()
  const eventId = id ?? ''
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const userId = profile?.id ?? null
  const online = useOnlineStatus()
  const [message, setMessage] = useState<string | null>(null)

  const bundleQuery = useQuery({
    queryKey: ['event_bundle', eventId],
    queryFn: () => fetchEventBundle(userId!, eventId),
    enabled: Boolean(userId && eventId),
  })

  if (!eventId || !userId) {
    return <p className="text-sm text-red-300">Evento no disponible.</p>
  }

  if (bundleQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Cargando sobrantes…</p>
  }

  if (bundleQuery.isError || !bundleQuery.data) {
    return (
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h1 className="font-semibold">Sobrantes no disponibles</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {bundleQuery.error?.message ?? 'No se encontró el evento.'}
        </p>
        <Link to="/eventos" className="mt-4 inline-flex text-sm text-neutral-300 underline">
          Volver a eventos
        </Link>
      </section>
    )
  }

  const bundle = bundleQuery.data
  const event = bundle.event
  const formKey = [
    event.id,
    ...bundle.inventory.map(
      (item) => `${item.item_id}:${item.avg_unit_cost}:${item.purchase_factor}`,
    ),
    ...bundle.leftoverCounts.map(
      (count) =>
        `${count.item_id}:${count.quantity}:${count.unit}:${count.unit_factor}:${count.updated_at}`,
    ),
  ].join('|')

  function handleSaved() {
    setMessage('Conteo de sobrantes guardado.')
    void queryClient.invalidateQueries({ queryKey: ['event_bundle', eventId] })
    void queryClient.invalidateQueries({ queryKey: ['events'] })
    void queryClient.invalidateQueries({ queryKey: ['event_finance_edits', eventId] })
  }

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-neutral-500">{event.folio}</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">
            Sobrantes del evento
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

      <p className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-400">
        Registra cuánto sobró de cada insumo. Para contar un insumo que no está aquí, primero
        regístralo como carga de inventario del evento.
      </p>

      {!online ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Conéctate a internet para guardar el conteo.
        </p>
      ) : null}

      {message ? (
        <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
          {message}
        </p>
      ) : null}

      {bundle.inventory.length === 0 ? (
        <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-sm text-neutral-400">Este evento todavía no tiene insumos cargados.</p>
          <Link
            to={`/eventos/${event.id}/inventario`}
            className="inline-flex rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-200"
          >
            Registrar carga de inventario
          </Link>
        </section>
      ) : (
        <EventLeftoverForm
          key={formKey}
          event={event}
          inventory={bundle.inventory}
          counts={bundle.leftoverCounts}
          online={online}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
