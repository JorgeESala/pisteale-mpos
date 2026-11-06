import { z } from 'zod'

export const promotionFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
    bundleQty: z.number().int().positive('Cantidad inválida'),
    fixedPrice: z.number().min(0, 'Precio inválido'),
    appliesTo: z.enum(['any', 'alcoholic', 'non_alcoholic']),
    appliesToTier: z.enum(['any', 'normal', 'premium']),
    includeCategoryIds: z.array(z.string().uuid()),
    excludeCategoryIds: z.array(z.string().uuid()),
    automatic: z.boolean(),
    active: z.boolean(),
    sortOrder: z.number().int(),
  })
  .superRefine((data, ctx) => {
    const overlap = data.includeCategoryIds.filter((id) => data.excludeCategoryIds.includes(id))

    if (data.includeCategoryIds.length > 0 && overlap.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Una categoría no puede estar incluida y excluida a la vez',
        path: ['includeCategoryIds'],
      })
    }
  })

export type PromotionForm = z.infer<typeof promotionFormSchema>
