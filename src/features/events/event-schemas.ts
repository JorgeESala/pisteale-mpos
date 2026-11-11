import { z } from 'zod'

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida')
  .or(z.literal(''))

export const eventFormSchema = z
  .object({
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
  .superRefine((data, ctx) => {
    if (data.startTime && data.endTime && data.endTime <= data.startTime) {
      ctx.addIssue({
        code: 'custom',
        message: 'La hora de fin debe ser posterior a la de inicio',
        path: ['endTime'],
      })
    }
  })

export type EventForm = z.infer<typeof eventFormSchema>

export const eventSaleItemSchema = z.object({
  productId: z.string().uuid().nullable(),
  productName: z.string().trim().min(1, 'Nombre requerido').max(200, 'Máximo 200 caracteres'),
  quantity: z.number().int().positive('Cantidad inválida'),
  unitPrice: z.number().min(0, 'Precio inválido'),
  promotionEligible: z.boolean(),
})

export const eventSaleFormSchema = z.object({
  items: z.array(eventSaleItemSchema).min(1, 'Agrega al menos una bebida'),
  applyPromotion: z.boolean(),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
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

export function localDateTimeToIso(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

export function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}
