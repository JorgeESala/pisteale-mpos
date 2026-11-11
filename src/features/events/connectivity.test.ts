import { afterEach, describe, expect, it, vi } from 'vitest'
import { isConnectivityError } from './connectivity'

describe('isConnectivityError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects offline mode', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    expect(isConnectivityError(new Error('cualquier cosa'))).toBe(true)
  })

  it('detects network messages', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)

    expect(isConnectivityError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isConnectivityError(new Error('fetch failed'))).toBe(true)
  })

  it('does not treat postgres errors as connectivity errors', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)

    expect(isConnectivityError({ code: '42501', message: 'No autorizado' })).toBe(false)
    expect(isConnectivityError(new Error('Evento no encontrado'))).toBe(false)
  })
})
