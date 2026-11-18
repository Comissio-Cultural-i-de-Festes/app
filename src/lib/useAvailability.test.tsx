import { QueryClient, QueryClientProvider, onlineManager, useQuery } from '@tanstack/react-query'
import { act, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STALL_MS, useAvailability, useStalled } from './useAvailability'

/**
 * Sense xarxa, una pantalla diu que no n'hi ha.
 *
 * Amb el client de debò i el `onlineManager` de debò, perquè el defecte era
 * justament el que fa React Query quan perd la xarxa —pausar, no fallar— i un
 * doble que fallés hauria provat el cas que ja funcionava.
 */

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function Probe({ queryFn }: { readonly queryFn: () => Promise<string> }) {
  const query = useQuery({ queryKey: ['probe'], queryFn, retry: false })
  const view = useAvailability(query)
  if (view.loading) return <p>esquelet</p>
  if (view.unavailable) {
    return (
      <>
        <p role="alert">{view.messageKey}</p>
        <button type="button" onClick={view.retry}>
          reintenta
        </button>
      </>
    )
  }
  return <p>{query.data}</p>
}

describe('useAvailability', () => {
  afterEach(() => {
    onlineManager.setOnline(true)
    vi.useRealTimers()
  })

  it('sense xarxa, una consulta sense dades surt com a missatge i no com a esquelet', async () => {
    onlineManager.setOnline(false)
    const client = new QueryClient()
    render(<Probe queryFn={() => Promise.resolve('dades')} />, { wrapper: wrapper(client) })

    expect(await screen.findByRole('alert')).toHaveTextContent('errors.offline')
  })

  it('quan torna la xarxa, entra sola', async () => {
    onlineManager.setOnline(false)
    const client = new QueryClient()
    render(<Probe queryFn={() => Promise.resolve('dades')} />, { wrapper: wrapper(client) })
    await screen.findByRole('alert')

    act(() => {
      onlineManager.setOnline(true)
    })

    expect(await screen.findByText('dades')).toBeInTheDocument()
  })

  it('una xarxa que no contesta acaba dient-ho, i reintentar torna a esperar', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    const never = vi.fn(() => new Promise<string>(() => undefined))
    render(<Probe queryFn={never} />, { wrapper: wrapper(client) })

    expect(screen.getByText('esquelet')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(STALL_MS)
    })
    expect(screen.getByRole('alert')).toHaveTextContent('errors.stalled')

    act(() => {
      screen.getByRole('button', { name: 'reintenta' }).click()
    })
    expect(screen.getByText('esquelet')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(STALL_MS)
    })
    expect(screen.getByRole('alert')).toHaveTextContent('errors.stalled')
  })
})

describe('useStalled', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('només després del termini, i torna a comptar a cada espera nova', () => {
    const { result, rerender } = renderHook(
      ({ waiting, round }: { waiting: boolean; round: number }) => useStalled(waiting, round),
      { initialProps: { waiting: true, round: 0 } },
    )
    expect(result.current).toBe(false)

    act(() => {
      vi.advanceTimersByTime(STALL_MS)
    })
    expect(result.current).toBe(true)

    // Reintentar: el mateix «esperant», una ronda nova.
    rerender({ waiting: true, round: 1 })
    expect(result.current).toBe(false)

    // La resposta arriba i després se n'espera una altra: tampoc no hereta.
    rerender({ waiting: false, round: 1 })
    rerender({ waiting: true, round: 1 })
    expect(result.current).toBe(false)
  })

  it('un rellotge compartit compta des del primer que espera', () => {
    const first = renderHook(() => useStalled(true, 0, STALL_MS, 'prova'))
    act(() => {
      vi.advanceTimersByTime(STALL_MS - 1000)
    })
    const second = renderHook(() => useStalled(true, 0, STALL_MS, 'prova'))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(first.result.current).toBe(true)
    expect(second.result.current).toBe(true)
  })

  it('quan tots els que el compartien se’n van, el següent comença de zero', () => {
    const first = renderHook(() => useStalled(true, 0, STALL_MS, 'prova'))
    act(() => {
      vi.advanceTimersByTime(STALL_MS - 1000)
    })
    first.unmount()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    const again = renderHook(() => useStalled(true, 0, STALL_MS, 'prova'))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(again.result.current).toBe(false)
  })
})
