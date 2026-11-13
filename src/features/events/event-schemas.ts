import { z } from 'zod'
import { EVENT_SALE_MAX_LINE_QTY, EVENT_SALE_MAX_TOTAL_UNITS } from './event-pricing'

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida')
  .or(z.literal(''))

export const eventFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  venue: z.string().trim().max(200, 'Máximo 200 caracteres'),
  eventDate: z.string().min(1, 'La fecha es obligatoria'),
  startTime: timeSchema,
  endTime: timeSchema,
  promotionEnabled: z.boolean(),
  bundleQty: z.number().int().min(2, 'Mínimo 2 bebidas'),
  bundlePrice: z.number().min(0, 'Precio inválido'),
  openingCash: z.number().min(0, 'Fondo inválido'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
})

export type EventForm = z.infer<typeof eventFormSchema>

export const eventSaleItemSchema = z.object({
  productId: z.string().uuid().nullable(),
  productName: z.string().trim().min(1, 'Nombre requerido').max(200, 'Máximo 200 caracteres'),
  quantity: z
    .number()
    .int()
    .positive('Cantidad inválida')
    .max(EVENT_SALE_MAX_LINE_QTY, `Máximo ${EVENT_SALE_MAX_LINE_QTY} por bebida`),
  unitPrice: z.number().min(0, 'Precio inválido'),
  promotionEligible: z.boolean(),
})

export const eventSaleFormSchema = z
  .object({
    items: z.array(eventSaleItemSchema).min(1, 'Agrega al menos una bebida'),
    applyPromotion: z.boolean(),
    paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']),
    notes: z.string().max(1000, 'Máximo 1000 caracteres'),
  })
  .superRefine((data, ctx) => {
    const totalUnits = data.items.reduce((sum, item) => sum + item.quantity, 0)

    if (totalUnits > EVENT_SALE_MAX_TOTAL_UNITS) {
      ctx.addIssue({
        code: 'custom',
        message: `Máximo ${EVENT_SALE_MAX_TOTAL_UNITS} bebidas por venta`,
        path: ['items'],
      })
    }
  })

export type EventSaleForm = z.infer<typeof eventSaleFormSchema>

export const eventExpenseFormSchema = z.object({
  category: z.enum(['supplies', 'ice', 'transport', 'staff', 'permits', 'rent', 'other']),
  description: z.string().trim().min(2, 'Mínimo 2 caracteres').max(200, 'Máximo 200 caracteres'),
  amount: z.number().positive('Monto inválido'),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']),
  reference: z.string().max(100, 'Máximo 100 caracteres'),
  spentAt: z.string().min(1, 'La fecha es obligatoria'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
})

export type EventExpenseForm = z.infer<typeof eventExpenseFormSchema>

export const eventInventoryItemSchema = z.object({
  itemId: z.string().uuid('Selecciona un insumo'),
  qtyPurchase: z.number().positive('Cantidad inválida'),
  purchaseFactor: z.number().positive('Contenido inválido'),
  totalCost: z.number().min(0, 'Costo inválido'),
})

export const eventInventoryLoadFormSchema = z.object({
  items: z.array(eventInventoryItemSchema).min(1, 'Agrega al menos un insumo'),
  category: z.enum(['supplies', 'ice', 'transport', 'staff', 'permits', 'rent', 'other']),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']),
  reference: z.string().max(100, 'Máximo 100 caracteres'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
})

export type EventInventoryLoadForm = z.infer<typeof eventInventoryLoadFormSchema>

export const eventInventoryAdjustSchema = z.object({
  countedQtyBase: z.number().min(0, 'El conteo no puede ser negativo'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
})

export const eventInventoryTransferSchema = z.object({
  qtyBase: z.number().positive('Cantidad inválida'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
})

export function localDateTimeToIso(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

export function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}
