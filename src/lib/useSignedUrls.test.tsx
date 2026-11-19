import { QueryClientProvider, focusManager } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
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
  vi.useRealTimers()
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
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    sign.mockImplementationOnce(down).mockImplementation(ok)
    const { wrapper } = setup()

    const { result } = renderHook(() => useSignedUrls('event-covers', ['e/cover.jpg']), {
      wrapper,
    })
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(result.current.data.get('e/cover.jpg')).toMatch(/^https:\/\/cdn\.test\//)
    expect(sign).toHaveBeenCalledTimes(2)
  })

  it('els reintents surten junts: sis camins amb la primera crida caiguda són dues peticions', async () => {
    // Abans cada consulta reintentava pel seu compte, en el seu setTimeout, i
    // cada reintent era una petició: [6, 1, 1, 1, 1, 1, 1]. Una galeria de dues
    // centes fotos amb la xarxa caiguda un moment en feia centenars.
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    sign.mockImplementationOnce(down).mockImplementation(ok)
    const { wrapper } = setup()
    const paths = [1, 2, 3, 4, 5, 6].map((n) => `e/${String(n)}.thumb.jpg`)

    const { result } = renderHook(() => useSignedUrls('event-photos', paths), { wrapper })
    await act(() => vi.advanceTimersByTimeAsync(10_000))

    expect(result.current.data.size).toBe(6)
    expect(sign.mock.calls.map((c) => c[0].length)).toEqual([6, 6])
  })

  it('si tots els reintents fallen, la consulta falla i no en surt cap de nou sola', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    sign.mockImplementation(down)
    const { client, wrapper } = setup()

    renderHook(() => useSignedUrls('event-photos', ['e/1.jpg', 'e/2.jpg']), { wrapper })
    await act(() => vi.advanceTimersByTimeAsync(60_000))

    expect(client.getQueryState(signedKey('event-photos', 'e/1.jpg'))?.status).toBe('error')
    expect(sign.mock.calls.length).toBeLessThanOrEqual(3)
    const settled = sign.mock.calls.length
    await act(() => vi.advanceTimersByTimeAsync(120_000))
    expect(sign).toHaveBeenCalledTimes(settled)
  })

  it('i si falla del tot, en tornar a l’app es torna a demanar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    sign.mockImplementation(down)
    const { client, wrapper } = setup()

    const { result } = renderHook(() => useSignedUrls('gimcana-photos', ['g/1.jpg']), { wrapper })
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(client.getQueryState(signedKey('gimcana-photos', 'g/1.jpg'))?.status).toBe('error')
    expect(result.current.data.size).toBe(0)
    vi.useRealTimers()

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

  it('una miniatura ja carregada no desapareix amb la pantalla oberta més d’una hora', async () => {
    // Sense cap muntatge ni focus pel mig, la llista canvia (una foto nova) i
    // les entrades velles queden fora del que s'ensenya: s'han de tornar a
    // demanar soles, i un cop signades tornen.
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    sign.mockImplementation(ok)
    const { wrapper } = setup()

    const { result, rerender } = renderHook(
      ({ paths }: { paths: string[] }) => useSignedUrls('event-photos', paths),
      { wrapper, initialProps: { paths: ['e/1.thumb.jpg', 'e/2.thumb.jpg'] } },
    )
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(result.current.data.size).toBe(2)
    const before = sign.mock.calls.length

    // El rellotge salta sense disparar el temporitzador de caducitat, que té el
    // seu propi test: aquí es prova el camí de la llista que canvia.
    vi.setSystemTime(Date.now() + 61 * 60_000)
    rerender({ paths: ['e/0.thumb.jpg', 'e/1.thumb.jpg', 'e/2.thumb.jpg'] })
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(result.current.data.size).toBe(3)
    expect(sign.mock.calls.length).toBe(before + 1)
    expect([...sign.mock.calls[before]![0]].sort()).toEqual([
      'e/0.thumb.jpg',
      'e/1.thumb.jpg',
      'e/2.thumb.jpg',
    ])
  })

  it('i si la nova firma falla, no es queda en un bucle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    sign.mockImplementation(ok)
    const { wrapper } = setup()
    const { result } = renderHook(() => useSignedUrls('event-photos', ['e/1.thumb.jpg']), {
      wrapper,
    })
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(result.current.data.size).toBe(1)

    sign.mockImplementation(down)
    await act(() => vi.advanceTimersByTimeAsync(61 * 60_000))
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    const settled = sign.mock.calls.length
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000))
    expect(sign).toHaveBeenCalledTimes(settled)
  })

  it('una galeria oberta tota la nit sense canvis es torna a signar quan caduca', async () => {
    // Res no torna a avaluar res: ni foco, ni llista nova. El temporitzador és
    // l'únic que pot adonar-se que una URL ha fet l'hora.
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    sign.mockImplementation(ok)
    const { wrapper } = setup()
    const { result } = renderHook(
      () => useSignedUrls('event-photos', ['e/1.thumb.jpg', 'e/2.thumb.jpg']),
      { wrapper },
    )
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(result.current.data.size).toBe(2)
    expect(sign).toHaveBeenCalledTimes(1)

    await act(() => vi.advanceTimersByTimeAsync(59 * 60_000))
    expect(sign).toHaveBeenCalledTimes(1)

    await act(() => vi.advanceTimersByTimeAsync(2 * 60_000))
    expect(sign).toHaveBeenCalledTimes(2)
    expect([...sign.mock.calls[1]![0]].sort()).toEqual(['e/1.thumb.jpg', 'e/2.thumb.jpg'])
    expect(result.current.data.size).toBe(2)
  })

  it('i en desmuntar no queda cap temporitzador viu', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    sign.mockImplementation(ok)
    const { wrapper } = setup()
    const { unmount } = renderHook(() => useSignedUrls('event-photos', ['e/1.thumb.jpg']), {
      wrapper,
    })
    await act(() => vi.advanceTimersByTimeAsync(0))
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(3 * 60 * 60_000))
    expect(sign).toHaveBeenCalledTimes(1)
  })

  it('un 401 no es reintenta: una sola crida', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    sign.mockImplementation(() =>
      Promise.resolve({ data: null, error: Object.assign(new Error('jwt'), { status: 401 }) }),
    )
    const { client, wrapper } = setup()
    renderHook(() => useSignedUrls('event-photos', ['e/1.jpg']), { wrapper })
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(sign).toHaveBeenCalledTimes(1)
    expect(client.getQueryState(signedKey('event-photos', 'e/1.jpg'))?.status).toBe('error')
  })

  it('un 429 sí que es reintenta', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    sign
      .mockImplementationOnce(() =>
        Promise.resolve({ data: null, error: Object.assign(new Error('slow'), { status: 429 }) }),
      )
      .mockImplementation(ok)
    const { wrapper } = setup()
    const { result } = renderHook(() => useSignedUrls('event-photos', ['e/1.jpg']), { wrapper })
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(sign).toHaveBeenCalledTimes(2)
    expect(result.current.data.size).toBe(1)
  })
})
