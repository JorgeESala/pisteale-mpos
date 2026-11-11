import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/types/database'
import { clearCachedProfile, loadCachedProfile, saveCachedProfile } from './profile-cache'

const profile: Profile = {
  id: 'user-1',
  full_name: 'Demo',
  role: 'admin',
  can_view_financials: true,
  can_adjust_inventory: true,
  can_manage_catalog: true,
  active: true,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
}

describe('profile cache', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves and restores a profile per user', () => {
    saveCachedProfile(profile)

    expect(loadCachedProfile('user-1')).toEqual(profile)
    expect(loadCachedProfile('user-2')).toBeNull()
  })

  it('clears a profile', () => {
    saveCachedProfile(profile)
    clearCachedProfile('user-1')

    expect(loadCachedProfile('user-1')).toBeNull()
  })

  it('ignores corrupt data', () => {
    window.localStorage.setItem('pisteale:user:user-1:profile-cache:v1', '{"bad":true}')

    expect(loadCachedProfile('user-1')).toBeNull()
    expect(window.localStorage.getItem('pisteale:user:user-1:profile-cache:v1')).toBeNull()
  })

  it('expires old profiles', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T00:00:00.000Z'))
    saveCachedProfile(profile)

    vi.setSystemTime(new Date('2026-11-20T00:00:00.000Z'))

    expect(loadCachedProfile('user-1')).toBeNull()
  })
})
