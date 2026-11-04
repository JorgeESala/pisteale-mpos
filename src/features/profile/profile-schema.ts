import { z } from 'zod'

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(80, 'El nombre no puede tener más de 80 caracteres'),
})

export type ProfileForm = z.infer<typeof profileSchema>
