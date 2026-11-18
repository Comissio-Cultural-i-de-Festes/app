import { QueryClientProvider, focusManager } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from './queryClient'
import { SIGNED_TTL_SECONDS, signedKey } from './signedQuery'
import { useSignedUrls } from './useSignedUrls'

/**
 * Una URL signada per camí, i les peticions juntes.
 *
 * Dos defectes que això tanca. El primer: la galeria signava amb una sola clau
 * feta de tots els camins, o sigui que una foto nova canviava la clau i es
 * tornaven a signar —i a baixar— totes les miniatures. El segon: una firma que
 * fallava per la xarxa tornava un `Map` buit com si res, es desava com a èxit i
 * la imatge quedava en blanc cinquanta minuts.
 *
 * Storage es fingeix: el que es prova és quines peticions surten i què arriba
 * a la pantalla, no el servidor.
 */

const sign = vi.fn<(paths: string[]) => Promise<unknown>>()

vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: (paths: string[]) => sign(paths),
      }),
    },
  },
}))

const ok = (paths: string[]) =>
  Promise.resolve({
    data: paths.map((p) => ({
      path: p,
      signedUrl: `https://cdn.test/${p}?token=${String(sign.mock.calls.length)}`,
      error: null,
    })),
    error: null,
  })

const down = () => Promise.resolve({ data: null, error: new Error('fetch failed') })

function setup() {
  const client = createQueryClient()
  // Sense espera entre reintents: el que es prova és que n'hi ha, no quan.
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

afterEach(() => {
  sign.mockReset()
  focusManager.setFocused(undefined)
})

describe('useSignedUrls', () => {
  it('ajunta en una sola petició tot el que es demana alhora', async () => {
    sign.mockImplementation(ok)
    const { wrapper } = setup()

    const a = renderHook(() => useSignedUrls('event-photos', ['e/1.thumb.jpg', 'e/2.thumb.jpg']), {
      wrapper,
    })
    const b = renderHook(() => useSignedUrls('event-photos', ['e/3.thumb.jpg']), { wrapper })

    await waitFor(() => {
      expect(a.result.current.data.size).toBe(2)
      expect(b.result.current.data.size).toBe(1)
    })
    expect(sign).toHaveBeenCalledTimes(1)
    expect(sign.mock.calls[0]![0]).toEqual(['e/1.thumb.jpg', 'e/2.thumb.jpg', 'e/3.thumb.jpg'])
  })

  it('una foto nova signa només la nova', async () => {
    sign.mockImplementation(ok)
    const { wrapper } = setup()

    const { result, rerender } = renderHook(
      ({ paths }: { paths: string[] }) => useSignedUrls('event-photos', paths),
      { wrapper, initialProps: { paths: ['e/1.thumb.jpg', 'e/2.thumb.jpg'] } },
    )
    await waitFor(() => {
      expect(result.current.data.size).toBe(2)
    })
    const first = result.current.data.get('e/1.thumb.jpg')

    rerender({ paths: ['e/0.thumb.jpg', 'e/1.thumb.jpg', 'e/2.thumb.jpg'] })
    await waitFor(() => {
      expect(result.current.data.size).toBe(3)
    })

    expect(sign).toHaveBeenCalledTimes(2)
    expect(sign.mock.calls[1]![0]).toEqual(['e/0.thumb.jpg'])
    expect(result.current.data.get('e/1.thumb.jpg')).toBe(first)
  })

  it('cada camí té la seva entrada, amb la URL i prou', async () => {
    sign.mockImplementation(ok)
    const { client, wrapper } = setup()

    const { result } = renderHook(() => useSignedUrls('avatars', ['u/1.jpg']), { wrapper })
    await waitFor(() => {
      expect(result.current.data.size).toBe(1)
    })
    expect(client.getQueryData(signedKey('avatars', 'u/1.jpg'))).toBe(
      result.current.data.get('u/1.jpg'),
    )
  })

  it('una URL absoluta passa tal com és, sense signar res', () => {
    const { wrapper } = setup()
    const google = 'https://lh3.googleusercontent.test/a/xyz'
    const { result } = renderHook(() => useSignedUrls('avatars', [google, null, '']), { wrapper })
    expect(result.current.data.get(google)).toBe(google)
    expect(result.current.data.size).toBe(1)
    expect(sign).not.toHaveBeenCalled()
  })

  it('si la firma falla per la xarxa, ho torna a provar i la imatge surt', async () => {
    sign.mockImplementationOnce(down).mockImplementation(ok)
    const { wrapper } = setup()

    const { result } = renderHook(() => useSignedUrls('event-covers', ['e/cover.jpg']), {
      wrapper,
    })
    await waitFor(() => {
      expect(result.current.data.get('e/cover.jpg')).toMatch(/^https:\/\/cdn\.test\//)
    })
    expect(sign).toHaveBeenCalledTimes(2)
  })

  it('i si falla del tot, en tornar a l’app es torna a demanar', async () => {
    sign.mockImplementation(down)
    const { client, wrapper } = setup()

    const { result } = renderHook(() => useSignedUrls('gimcana-photos', ['g/1.jpg']), { wrapper })
    await waitFor(() => {
      expect(client.getQueryState(signedKey('gimcana-photos', 'g/1.jpg'))?.status).toBe('error')
    })
    expect(result.current.data.size).toBe(0)

    sign.mockImplementation(ok)
    focusManager.setFocused(false)
    focusManager.setFocused(true)

    await waitFor(() => {
      expect(result.current.data.get('g/1.jpg')).toMatch(/^https:\/\/cdn\.test\//)
    })
  })

  it('una URL que ja ha caducat no s’ensenya mentre se’n signa una altra', async () => {
    sign.mockImplementation(() => new Promise(() => undefined))
    const { client, wrapper } = setup()
    client.setQueryData(signedKey('event-photos', 'e/vella.jpg'), 'https://cdn.test/vella', {
      updatedAt: Date.now() - (SIGNED_TTL_SECONDS + 60) * 1000,
    })
    client.setQueryData(signedKey('event-photos', 'e/viva.jpg'), 'https://cdn.test/viva', {
      updatedAt: Date.now() - 5 * 60_000,
    })

    const { result } = renderHook(
      () => useSignedUrls('event-photos', ['e/vella.jpg', 'e/viva.jpg']),
      { wrapper },
    )

    expect(result.current.data.has('e/vella.jpg')).toBe(false)
    expect(result.current.data.get('e/viva.jpg')).toBe('https://cdn.test/viva')
    await waitFor(() => {
      expect(sign).toHaveBeenCalledWith(['e/vella.jpg'])
    })
  })
})
