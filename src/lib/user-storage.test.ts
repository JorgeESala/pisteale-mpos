import { beforeEach, describe, expect, it } from 'vitest'
import { clearUserStorage, userStorageKey } from './user-storage'

describe('user storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('builds namespaced keys', () => {
    expect(userStorageKey('user-1', 'queue')).toBe('pisteale:user:user-1:queue')
  })

  it('clears only the requested user keys', () => {
    window.localStorage.setItem(userStorageKey('user-1', 'queue'), 'a')
    window.localStorage.setItem(userStorageKey('user-1', 'cache'), 'b')
    window.localStorage.setItem(userStorageKey('user-2', 'queue'), 'c')
    window.localStorage.setItem('other', 'd')

    clearUserStorage('user-1')

    expect(window.localStorage.getItem(userStorageKey('user-2', 'queue'))).toBe('c')
    expect(window.localStorage.getItem('other')).toBe('d')
    expect(window.localStorage.length).toBe(2)
  })
})
