import { describe, expect, it } from 'vitest'
import { userAccessFormSchema } from './user-schemas'

describe('userAccessFormSchema', () => {
  it('accepts a valid access configuration', () => {
    const result = userAccessFormSchema.safeParse({
      role: 'operador',
      active: true,
      canViewFinancials: false,
      canAdjustInventory: true,
      canManageCatalog: true,
    })

    expect(result.success).toBe(true)
  })

  it('rejects an invalid role', () => {
    const result = userAccessFormSchema.safeParse({
      role: 'barman',
      active: true,
      canViewFinancials: false,
      canAdjustInventory: false,
      canManageCatalog: true,
    })

    expect(result.success).toBe(false)
  })
})
