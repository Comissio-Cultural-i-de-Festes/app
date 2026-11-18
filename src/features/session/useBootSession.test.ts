import { AuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBootSession } from './useBootSession'

/**
 * Una sessió desada que no es pot renovar no és «no has entrat».
 *
 * Abans, aquest cas acabava a la pantalla d'entrada: qui ja havia entrat i no
 * tenia xarxa se la trobava demanant-li el correu.
 */

type Listener = (event: string, session: Session | null) => void

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  listeners: [] as Listener[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      onAuthStateChange: (listener: Listener) => {
        auth.listeners.push(listener)
        return { data: { subscription: { unsubscribe: () => undefined } } }
      },
    },
  },
}))

const session = { user: { id: 'u1' } } as unknown as Session
const unreachable = {
  data: { session: null },
  error: new AuthRetryableFetchError('Failed to fetch', 0),
}

beforeEach(() => {
  auth.getSession.mockReset()
  auth.listeners.length = 0
})

describe('useBootSession', () => {
  it('amb la sessió llegible, entra', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    const { result } = renderHook(() => useBootSession())

    await waitFor(() => {
      expect(result.current.phase).toBe('ready')
    })
    expect(result.current.session).toBe(session)
  })

  it('sense sessió desada, entra a la porta', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { result } = renderHook(() => useBootSession())

    await waitFor(() => {
      expect(result.current.phase).toBe('ready')
    })
    expect(result.current.session).toBeNull()
  })

  it('una renovació que no surt per falta de xarxa diu «sense connexió»', async () => {
    auth.getSession.mockResolvedValue(unreachable)
    const { result } = renderHook(() => useBootSession())

    await waitFor(() => {
      expect(result.current.phase).toBe('unreachable')
    })
  })

  it('quan torna la xarxa entra sol', async () => {
    auth.getSession.mockResolvedValueOnce(unreachable)
    const { result } = renderHook(() => useBootSession())
    await waitFor(() => {
      expect(result.current.phase).toBe('unreachable')
    })

    auth.getSession.mockResolvedValueOnce({ data: { session }, error: null })
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => {
      expect(result.current.phase).toBe('ready')
    })
    expect(result.current.session).toBe(session)
  })

  it('la renovació automàtica també obre la porta', async () => {
    auth.getSession.mockResolvedValue(unreachable)
    const { result } = renderHook(() => useBootSession())
    await waitFor(() => {
      expect(result.current.phase).toBe('unreachable')
    })

    act(() => {
      for (const listener of auth.listeners) listener('TOKEN_REFRESHED', session)
    })

    expect(result.current.phase).toBe('ready')
    expect(result.current.session).toBe(session)
  })

  it("l'INITIAL_SESSION buit no és tancar la sessió", async () => {
    auth.getSession.mockResolvedValue(unreachable)
    const { result } = renderHook(() => useBootSession())

    act(() => {
      for (const listener of auth.listeners) listener('INITIAL_SESSION', null)
    })

    await waitFor(() => {
      expect(result.current.phase).toBe('unreachable')
    })
  })
})
