import { beforeEach, describe, expect, it } from 'vitest'
import { clearUserCaches, clearUserStorage, userStorageKey } from './user-storage'

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

  it('preserves offline queues when clearing session caches', () => {
    window.localStorage.setItem(userStorageKey('user-1', 'profile-cache:v1'), 'profile')
    window.localStorage.setItem(userStorageKey('user-1', 'event-list-cache:v2'), 'events')
    window.localStorage.setItem(userStorageKey('user-1', 'event-sales-queue:v2'), 'sale')
    window.localStorage.setItem(userStorageKey('user-1', 'event-expenses-queue:v2'), 'expense')
    window.localStorage.setItem('pisteale:form-draft:sale:user-1:nuevo', 'draft')

    clearUserCaches('user-1')

    expect(window.localStorage.getItem(userStorageKey('user-1', 'profile-cache:v1'))).toBeNull()
    expect(window.localStorage.getItem(userStorageKey('user-1', 'event-list-cache:v2'))).toBeNull()
    expect(window.localStorage.getItem(userStorageKey('user-1', 'event-sales-queue:v2'))).toBe(
      'sale',
    )
    expect(window.localStorage.getItem(userStorageKey('user-1', 'event-expenses-queue:v2'))).toBe(
      'expense',
    )
    expect(window.localStorage.getItem('pisteale:form-draft:sale:user-1:nuevo')).toBeNull()
  })
})
