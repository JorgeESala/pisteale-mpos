import { z } from 'zod'

export const purchaseItemFormSchema = z.object({
  itemId: z.string().uuid('Selecciona un insumo'),
  qtyPurchase: z.number().positive('Cantidad inválida'),
  purchaseFactor: z.number().positive('Contenido inválido'),
  totalCost: z.number().min(0, 'Costo inválido'),
})

export const purchaseFormSchema = z
  .object({
    purchaseDate: z.string().min(1, 'La fecha es obligatoria'),
    supplier: z.string().max(120, 'Máximo 120 caracteres'),
    invoiceRef: z.string().max(60, 'Máximo 60 caracteres'),
    notes: z.string().max(1000, 'Máximo 1000 caracteres'),
    items: z.array(purchaseItemFormSchema).min(1, 'Agrega al menos un insumo'),
  })
  .superRefine((data, ctx) => {
    const itemIds = data.items.map((item) => item.itemId).filter(Boolean)

    if (new Set(itemIds).size !== itemIds.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'No repitas el mismo insumo',
        path: ['items'],
      })
    }
  })

export type PurchaseForm = z.infer<typeof purchaseFormSchema>

export const inventoryAdjustmentFormSchema = z.object({
  countedQty: z.number().min(0, 'El conteo no puede ser negativo'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
})

export type InventoryAdjustmentForm = z.infer<typeof inventoryAdjustmentFormSchema>

export const inventoryWasteFormSchema = z.object({
  wasteDate: z.string().min(1, 'La fecha es obligatoria'),
  itemId: z.string().uuid('Selecciona un insumo'),
  qty: z.number().positive('La cantidad debe ser mayor a cero'),
  reason: z.enum(['fondo_botella', 'producto_vencido', 'derrame', 'otro']),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
})

export type InventoryWasteForm = z.infer<typeof inventoryWasteFormSchema>

export const openBottleFormSchema = z.object({
  openingDate: z.string().min(1, 'La fecha es obligatoria'),
  itemId: z.string().uuid('Selecciona un insumo'),
  initialMl: z.number().positive('La cantidad debe ser mayor a cero'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
})

export type OpenBottleForm = z.infer<typeof openBottleFormSchema>

export const consumeBottleFormSchema = z.object({
  qtyMl: z.number().positive('La cantidad debe ser mayor a cero'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
})

export type ConsumeBottleForm = z.infer<typeof consumeBottleFormSchema>

export const closeBottleFormSchema = z.object({
  leftoverMl: z.number().min(0, 'El sobrante no puede ser negativo'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
})

export type CloseBottleForm = z.infer<typeof closeBottleFormSchema>
