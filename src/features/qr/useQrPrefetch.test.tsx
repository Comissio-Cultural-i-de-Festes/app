import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { readCachedToken } from './api'
import { useQrPrefetch } from './useQrPrefetch'

/**
 * El QR es desa en entrar, una sola vegada, i només per a qui en pot tenir.
 */

const ME = '00000000-0000-4000-8000-000000000001'
const TOKEN = 'fd6b16d0-1030-4b84-a8d9-3db4b9fa6205'

const rpc = vi.hoisted(() => vi.fn())
const profile = vi.hoisted<{ current: { estat: string } | undefined }>(() => ({
  current: { estat: 'actiu' },
}))

vi.mock('@/lib/supabase', () => ({
  rpc: (...args: unknown[]) => rpc(...args) as unknown,
}))
vi.mock('@/features/session/useUserId', () => ({ useUserId: () => ME }))
vi.mock('@/features/session/useMyProfile', () => ({
  useMyProfile: () => ({ data: profile.current, dataUpdatedAt: 1 }),
}))

function wrapper({ children }: { readonly children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => {
  localStorage.clear()
  rpc.mockReset()
  rpc.mockResolvedValue({ data: TOKEN, error: null })
})

describe('useQrPrefetch', () => {
  it('un soci actiu sense codi desat el té desat sense obrir la pantalla', async () => {
    profile.current = { estat: 'actiu' }
    renderHook(() => useQrPrefetch(), { wrapper })

    await waitFor(() => {
      expect(readCachedToken(ME)).toBe(TOKEN)
    })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('amb un codi ja desat no surt a la xarxa', () => {
    localStorage.setItem(`comi.qr.${ME}`, TOKEN)
    profile.current = { estat: 'actiu' }
    renderHook(() => useQrPrefetch(), { wrapper })

    expect(rpc).not.toHaveBeenCalled()
  })

  it('a un pendent no li demana res', () => {
    profile.current = { estat: 'pendent' }
    renderHook(() => useQrPrefetch(), { wrapper })

    expect(rpc).not.toHaveBeenCalled()
  })

  it('sense perfil encara, espera', () => {
    profile.current = undefined
    renderHook(() => useQrPrefetch(), { wrapper })

    expect(rpc).not.toHaveBeenCalled()
  })
})
