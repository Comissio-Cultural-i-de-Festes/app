import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pendingInvite } from './pendingInvite'
import { useRedeemFromLink } from './useRedeemFromLink'

/**
 * El bescanvi del codi que ha arribat per l'enllaç.
 *
 * Tres coses que només es veuen amb mala cobertura, que és el supòsit de tota
 * l'app: el bescanvi que no arriba s'ha de tornar a provar sol; el codi no
 * s'ha de perdre quan el primer cop navega i treu el `?codi=` de l'adreça; i
 * només un bescanvi que el servidor ha acceptat refresca les dades.
 */

interface Reply {
  data: { ok: boolean } | null
  error: { code: string; message: string } | null
}
const redeem = vi.fn<(code: string) => Promise<Reply>>()

vi.mock('@/lib/supabase', () => ({
  rpc: (_fn: string, args: { p_codi: string }) => redeem(args.p_codi),
}))

const invalidate = vi.fn(() => Promise.resolve())
vi.mock('@/lib/signedQuery', () => ({ invalidateData: () => invalidate() }))

const USER = '00000000-0000-4000-8000-0000000000a1'
const CODE = 'ABC-123'
const OFFLINE: Reply = { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } }

function mount(userId: string | null = USER) {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(
    () => {
      useRedeemFromLink(userId)
    },
    { wrapper },
  )
}

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState({}, '', `/?codi=${CODE}`)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  window.history.replaceState({}, '', '/')
})

describe('redeeming the code from the link', () => {
  it('refreshes the data once the server says yes, and rubs the code out', async () => {
    redeem.mockResolvedValue({ data: { ok: true }, error: null })
    mount()

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledTimes(1)
    })
    expect(redeem).toHaveBeenCalledWith(CODE)
    expect(window.location.search).toBe('')
    expect(pendingInvite()).toBeNull()
  })

  it('does not refresh anything for a code the server turned down', async () => {
    // `ok: false` arriba sense error: tractar-lo com un sí refrescaria per
    // res, i el perfil que diu `pendent` és cert.
    redeem.mockResolvedValue({ data: { ok: false }, error: null })
    mount()

    await waitFor(() => {
      expect(window.location.search).toBe('')
    })
    expect(invalidate).not.toHaveBeenCalled()
    expect(pendingInvite()).toBeNull()
  })

  it('waits for no session', () => {
    mount(null)
    expect(redeem).not.toHaveBeenCalled()
  })

  it('keeps the code when the request never arrived, and tries again when the signal is back', async () => {
    redeem.mockResolvedValueOnce(OFFLINE)
    mount()

    await waitFor(() => {
      expect(redeem).toHaveBeenCalledTimes(1)
    })
    expect(window.location.search).toBe(`?codi=${CODE}`)
    expect(pendingInvite()).toBe(CODE)
    expect(invalidate).not.toHaveBeenCalled()

    redeem.mockResolvedValueOnce({ data: { ok: true }, error: null })
    window.dispatchEvent(new Event('online'))

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledTimes(1)
    })
    expect(pendingInvite()).toBeNull()
  })

  it('tries again by itself a few times, without waiting for an online event', async () => {
    // Una wifi que diu que hi és i no porta res no dispara mai `online`.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    redeem.mockResolvedValueOnce(OFFLINE).mockResolvedValueOnce({ data: { ok: true }, error: null })
    mount()

    await waitFor(() => {
      expect(redeem).toHaveBeenCalledTimes(1)
    })
    await vi.advanceTimersByTimeAsync(15_000)
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledTimes(1)
    })
  })

  it('still redeems after the first-run screen took the code out of the address', async () => {
    // `RequireOnboarding` navega a `/primer-cop` i la query se'n va amb ell.
    redeem.mockResolvedValueOnce(OFFLINE)
    const first = mount()
    await waitFor(() => {
      expect(redeem).toHaveBeenCalledTimes(1)
    })
    first.unmount()

    window.history.replaceState({}, '', '/primer-cop')
    redeem.mockResolvedValueOnce({ data: { ok: true }, error: null })
    mount()

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledTimes(1)
    })
    expect(redeem).toHaveBeenLastCalledWith(CODE)
  })

  it('gives up on an answer from the database, which will not change by asking again', async () => {
    // 42501: la invitació s'ha gastat entremig. No és la xarxa.
    redeem.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'invitacio exhaurida' },
    })
    mount()

    await waitFor(() => {
      expect(pendingInvite()).toBeNull()
    })
    expect(redeem).toHaveBeenCalledTimes(1)
    expect(invalidate).not.toHaveBeenCalled()
  })
})
