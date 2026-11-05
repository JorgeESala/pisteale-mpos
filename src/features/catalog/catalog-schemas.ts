import { z } from 'zod'

export const productFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
  description: z.string().max(1000, 'Máximo 1000 caracteres'),
  categoryId: z.string(),
  kind: z.enum(['preparado', 'botella', 'servicio']),
  price: z.number().min(0, 'Precio inválido'),
  isAlcoholic: z.boolean(),
  servingSizeMl: z.number().int().positive('Tamaño inválido'),
  active: z.boolean(),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
})

export type ProductForm = z.infer<typeof productFormSchema>

export const inventoryItemFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
  categoryId: z.string(),
  kind: z.enum(['ingrediente', 'consumible', 'botella', 'preparacion']),
  baseUnit: z.enum(['ml', 'g', 'pza']),
  purchaseUnit: z.string().trim().min(1, 'Requerido').max(30, 'Máximo 30 caracteres'),
  purchaseFactor: z.number().positive('Debe ser mayor a 0'),
  avgCost: z.number().min(0, 'Costo inválido'),
  minStockBase: z.number().int().min(0, 'Stock inválido'),
  trackStock: z.boolean(),
  active: z.boolean(),
})

export type InventoryItemForm = z.infer<typeof inventoryItemFormSchema>

export const recipeItemSchema = z.object({
  inventory_item_id: z.string().uuid('Selecciona un insumo'),
  qty_base: z.number().int().positive('Cantidad inválida'),
})

export const recipeFormSchema = z.object({
  yieldQty: z.number().positive('Rendimiento inválido'),
  yieldUnit: z.string().trim().min(1, 'Requerido').max(30, 'Máximo 30 caracteres'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres'),
  items: z.array(recipeItemSchema).min(1, 'Agrega al menos un insumo'),
})

export type RecipeForm = z.infer<typeof recipeFormSchema>
