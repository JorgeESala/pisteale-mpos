import { describe, expect, it } from 'vitest'
import { profileSchema } from './profile-schema'

describe('profileSchema', () => {
  it('accepts a valid name', () => {
    const result = profileSchema.safeParse({ fullName: 'Jorge Sala' })

    expect(result.success).toBe(true)
  })

  it('trims surrounding whitespace', () => {
    const result = profileSchema.parse({ fullName: '  Jorge  ' })

    expect(result.fullName).toBe('Jorge')
  })

  it('rejects a name shorter than 2 characters', () => {
    const result = profileSchema.safeParse({ fullName: 'A' })

    expect(result.success).toBe(false)
  })

  it('rejects a name longer than 80 characters', () => {
    const result = profileSchema.safeParse({ fullName: 'a'.repeat(81) })

    expect(result.success).toBe(false)
  })
})
