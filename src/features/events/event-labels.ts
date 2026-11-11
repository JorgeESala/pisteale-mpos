import type { EventExpenseCategory, EventStatus, PaymentMethod } from '@/types/database'

export const eventStatusLabels: Record<EventStatus, string> = {
  open: 'En curso',
  closed: 'Cerrado',
}

export const expenseCategoryLabels: Record<EventExpenseCategory, string> = {
  supplies: 'Insumos',
  ice: 'Hielo',
  transport: 'Transporte',
  staff: 'Personal',
  permits: 'Permisos',
  rent: 'Renta',
  other: 'Otros',
}

export const eventPaymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
}
