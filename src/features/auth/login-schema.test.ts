import { describe, expect, it } from 'vitest'
import { loginSchema } from './login-schema'

describe('loginSchema', () => {
  it('accepts a valid email and password', () => {
    const result = loginSchema.safeParse({
      email: 'admin@pisteale.local',
      password: 'secret',
    })

    expect(result.success).toBe(true)
  })

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'admin',
      password: 'secret',
    })

    expect(result.success).toBe(false)
  })

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({
      email: 'admin@pisteale.local',
      password: '',
    })

    expect(result.success).toBe(false)
  })
})
