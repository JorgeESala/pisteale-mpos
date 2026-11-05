import { z } from 'zod'

export const productFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
    description: z.string().max(1000, 'Máximo 1000 caracteres'),
    categoryId: z.string(),
    kind: z.enum(['preparado', 'botella', 'servicio']),
    price: z.number().min(0, 'Precio inválido'),
    premiumPrice: z.number().nullable(),
    isAlcoholic: z.boolean(),
    servingSizeMl: z.number().int().positive('Tamaño inválido'),
    active: z.boolean(),
    notes: z.string().max(1000, 'Máximo 1000 caracteres'),
  })
  .superRefine((data, ctx) => {
    if (data.isAlcoholic && (data.premiumPrice === null || data.premiumPrice < 0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Precio premium requerido',
        path: ['premiumPrice'],
      })
    }
  })

export type ProductForm = z.infer<typeof productFormSchema>

export const inventoryGroupFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
  categoryId: z.string(),
  baseUnit: z.enum(['ml', 'g', 'pza']),
  isTiered: z.boolean(),
  active: z.boolean(),
})

export type InventoryGroupForm = z.infer<typeof inventoryGroupFormSchema>

export const inventoryItemFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
  groupId: z.string().uuid('Selecciona un grupo'),
  tier: z.enum(['estandar', 'premium']).nullable(),
  kind: z.enum(['ingrediente', 'consumible', 'botella', 'preparacion']),
  purchaseUnit: z.string().trim().min(1, 'Requerido').max(30, 'Máximo 30 caracteres'),
  purchaseFactor: z.number().positive('Debe ser mayor a 0'),
  avgCost: z.number().min(0, 'Costo inválido'),
  minStockBase: z.number().int().min(0, 'Stock inválido'),
  trackStock: z.boolean(),
  active: z.boolean(),
})

export type InventoryItemForm = z.infer<typeof inventoryItemFormSchema>

export const recipeItemSchema = z.object({
  inventory_group_id: z.string().uuid('Selecciona un grupo'),
  tier_rule: z.enum(['any', 'estandar', 'premium', 'match']),
  qty: z.number().positive('Cantidad inválida'),
  unit: z.enum(['ml', 'oz', 'g', 'pza']),
})

export const recipeFormSchema = z.object({
  yieldQty: z.number().positive('Rendimiento inválido'),
  yieldUnit: z.string().trim().min(1, 'Requerido').max(30, 'Máximo 30 caracteres'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
  items: z.array(recipeItemSchema).min(1, 'Agrega al menos un insumo'),
})

export type RecipeForm = z.infer<typeof recipeFormSchema>

export const defaultConsumablesFormSchema = z.object({
  iceGroupId: z.string().uuid('Selecciona un grupo'),
  cupGroupId: z.string().uuid('Selecciona un grupo'),
  lidGroupId: z.string().uuid('Selecciona un grupo'),
  strawGroupId: z.string().uuid('Selecciona un grupo'),
  cupQty: z.number().int().positive('Cantidad inválida'),
  lidQty: z.number().int().positive('Cantidad inválida'),
  strawQty: z.number().int().positive('Cantidad inválida'),
  iceDensity: z.number().positive('Densidad inválida'),
  iceActive: z.boolean(),
  cupActive: z.boolean(),
  lidActive: z.boolean(),
  strawActive: z.boolean(),
})

export type DefaultConsumablesForm = z.infer<typeof defaultConsumablesFormSchema>

export const iceDailyRecordFormSchema = z.object({
  recordDate: z.string().min(1, 'La fecha es obligatoria'),
  bags: z.number().min(0, 'Bolsas inválidas').nullable(),
  totalCost: z.number().min(0, 'Gasto inválido'),
  drinksSold: z.number().int().positive('Bebidas inválidas'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
})

export type IceDailyRecordForm = z.infer<typeof iceDailyRecordFormSchema>
