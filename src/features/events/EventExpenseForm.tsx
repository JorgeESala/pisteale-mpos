import { useState } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { formDraftKey } from '@/lib/form-drafts'
import { useDraftState } from '@/lib/use-draft-state'
import type {
  EventExpenseCategory,
  EventExpenseView,
  EventView,
  PaymentMethod,
} from '@/types/database'
import { eventPaymentMethodLabels, expenseCategoryLabels } from './event-labels'
import { isConnectivityError } from './connectivity'
import { eventExpenseFormSchema, localDateTimeToIso, localDateTimeValue } from './event-schemas'
import { createClientId, enqueueEventExpense } from './offline-queue'
import { createEventExpense, updateEventExpense } from './queries'

type EventExpenseDraft = {
  category: EventExpenseCategory
  description: string
  amount: string
  paymentMethod: PaymentMethod
  reference: string
  spentAt: string
  notes: string
}

function emptyExpenseDraft(): EventExpenseDraft {
  return {
    category: 'supplies',
    description: '',
    amount: '',
    paymentMethod: 'cash',
    reference: '',
    spentAt: localDateTimeValue(),
    notes: '',
  }
}

function draftFromExpense(expense: EventExpenseView): EventExpenseDraft {
  return {
    category: expense.category,
    description: expense.description,
    amount: String(expense.amount),
    paymentMethod: expense.payment_method,
    reference: expense.reference,
    spentAt: localDateTimeValue(new Date(expense.spent_at)),
    notes: expense.notes,
  }
}

type EventExpenseFormProps = {
  event: EventView
  online: boolean
  onExpenseSaved: (pending: boolean) => void
  expense?: EventExpenseView | null
  onCancelEdit?: () => void
}

export function EventExpenseForm({
  event,
  online,
  onExpenseSaved,
  expense,
  onCancelEdit,
}: EventExpenseFormProps) {
  const { profile } = useAuth()
  const userId = profile?.id ?? null
  const isEditing = Boolean(expense)
  const storageKey = !isEditing && userId ? formDraftKey('event-expense', userId, event.id) : null
  const [initialDraft] = useState(() => (expense ? draftFromExpense(expense) : emptyExpenseDraft()))
  const {
    value: draft,
    setValue: setDraft,
    restored,
    discard,
  } = useDraftState<EventExpenseDraft>({
    storageKey,
    initialValue: initialDraft,
  })

  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function updateDraft(patch: Partial<EventExpenseDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  async function submitExpense() {
    setError(null)
    setMessage(null)

    const amount = Number(draft.amount)
    const validation = eventExpenseFormSchema.safeParse({
      category: draft.category,
      description: draft.description,
      amount,
      paymentMethod: draft.paymentMethod,
      reference: draft.reference,
      spentAt: draft.spentAt,
      notes: draft.notes,
    })

    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Revisa el gasto.')
      return
    }

    setSubmitting(true)

    try {
      if (!userId) {
        throw new Error('La sesión no está disponible. Vuelve a iniciar sesión.')
      }

      const input = {
        clientId: createClientId(),
        eventId: event.id,
        category: draft.category,
        description: draft.description,
        amount,
        paymentMethod: draft.paymentMethod,
        reference: draft.reference,
        spentAt: localDateTimeToIso(draft.spentAt),
        notes: draft.notes,
      }

      if (isEditing && expense) {
        if (!online) {
          throw new Error('Conéctate a internet para editar el gasto.')
        }

        await updateEventExpense({
          expenseId: expense.id,
          eventId: event.id,
          category: draft.category,
          description: draft.description,
          amount,
          paymentMethod: draft.paymentMethod,
          reference: draft.reference,
          spentAt: localDateTimeToIso(draft.spentAt),
          notes: draft.notes,
        })
        setMessage('Gasto actualizado.')
        onExpenseSaved(false)
        return
      }

      if (online) {
        try {
          await createEventExpense(input)
          discard()
          setMessage('Gasto registrado.')
          onExpenseSaved(false)
          return
        } catch (onlineError) {
          if (!isConnectivityError(onlineError)) {
            throw onlineError
          }
        }
      }

      enqueueEventExpense(userId, input)
      discard()
      setMessage('Gasto guardado sin conexión. Se sincronizará al recuperar señal.')
      onExpenseSaved(true)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'No se pudo registrar el gasto.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div>
        <h2 className="font-semibold">{isEditing ? 'Editar gasto' : 'Registrar gasto'}</h2>
        <p className="mt-1 text-sm text-neutral-400">
          {isEditing
            ? 'Corrige el gasto manual. El cambio quedará registrado en el historial del evento.'
            : 'Insumos, hielo, transporte, personal o cualquier costo del evento.'}
        </p>
      </div>

      {restored ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-400/40 bg-brand-400/10 p-3 text-sm">
          <p className="text-brand-100">Gasto sin terminar restaurado.</p>
          <button
            type="button"
            onClick={discard}
            className="shrink-0 rounded-lg border border-brand-400/40 px-2 py-1 text-xs text-brand-200"
          >
            Descartar
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="expenseCategory" className="mb-1.5 block text-sm text-neutral-300">
            Categoría
          </label>
          <select
            id="expenseCategory"
            value={draft.category}
            onChange={(changeEvent) =>
              updateDraft({ category: changeEvent.target.value as EventExpenseCategory })
            }
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-neutral-100 outline-none focus:border-brand-400"
          >
            {Object.entries(expenseCategoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="expenseAmount" className="mb-1.5 block text-sm text-neutral-300">
            Monto
          </label>
          <input
            id="expenseAmount"
            type="number"
            min="0"
            step="0.01"
            value={draft.amount}
            onChange={(changeEvent) => updateDraft({ amount: changeEvent.target.value })}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none focus:border-brand-400"
          />
        </div>
      </div>

      <div>
        <label htmlFor="expenseDescription" className="mb-1.5 block text-sm text-neutral-300">
          Descripción
        </label>
        <input
          id="expenseDescription"
          type="text"
          value={draft.description}
          onChange={(changeEvent) => updateDraft({ description: changeEvent.target.value })}
          placeholder="Ej. Hielo y vasos"
          className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none focus:border-brand-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="expensePayment" className="mb-1.5 block text-sm text-neutral-300">
            Pago
          </label>
          <select
            id="expensePayment"
            value={draft.paymentMethod}
            onChange={(changeEvent) =>
              updateDraft({ paymentMethod: changeEvent.target.value as PaymentMethod })
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
          <label htmlFor="expenseReference" className="mb-1.5 block text-sm text-neutral-300">
            Referencia
          </label>
          <input
            id="expenseReference"
            type="text"
            value={draft.reference}
            onChange={(changeEvent) => updateDraft({ reference: changeEvent.target.value })}
            placeholder="Opcional"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none focus:border-brand-400"
          />
        </div>
      </div>

      <div>
        <label htmlFor="expenseSpentAt" className="mb-1.5 block text-sm text-neutral-300">
          Fecha y hora
        </label>
        <input
          id="expenseSpentAt"
          type="datetime-local"
          value={draft.spentAt}
          onChange={(changeEvent) => updateDraft({ spentAt: changeEvent.target.value })}
          className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none focus:border-brand-400"
        />
      </div>

      <div>
        <label htmlFor="expenseNotes" className="mb-1.5 block text-sm text-neutral-300">
          Notas
        </label>
        <textarea
          id="expenseNotes"
          rows={2}
          value={draft.notes}
          onChange={(changeEvent) => updateDraft({ notes: changeEvent.target.value })}
          placeholder="Opcional"
          className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-100 outline-none focus:border-brand-400"
        />
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

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submitExpense()}
          disabled={submitting || (isEditing && !online)}
          className="flex-1 rounded-xl bg-brand-400 px-4 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-brand-300 disabled:opacity-60"
        >
          {submitting ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Registrar gasto'}
        </button>
        {isEditing && onCancelEdit ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-xl border border-neutral-700 px-4 py-3 text-sm text-neutral-300"
          >
            Cerrar
          </button>
        ) : null}
      </div>
    </section>
  )
}
