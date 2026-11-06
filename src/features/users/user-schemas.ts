import { z } from 'zod'

export const userAccessFormSchema = z.object({
  role: z.enum(['admin', 'operador', 'consulta']),
  active: z.boolean(),
  canViewFinancials: z.boolean(),
  canAdjustInventory: z.boolean(),
  canManageCatalog: z.boolean(),
})

export type UserAccessForm = z.infer<typeof userAccessFormSchema>
