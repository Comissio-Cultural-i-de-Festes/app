import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { eventKeys } from '@/features/event/api'
import { UserIdContext } from '@/features/session/context'
import { profileKeys } from '@/features/session/profile'

import type { AnswerResult } from './api'
import { homeKeys } from './api'
import { type EventSummary, emptySummary } from './summary'
import { useAnswer } from './useHome'

/**
 * El «sí» és optimista: el resum canvia en prémer, el servidor té l'última
 * paraula i un error ho desfà.
 */

const setAnswer = vi.fn<(eventId: string, estado: string) => Promise<AnswerResult>>()
vi.mock('./api', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  setAnswer: (eventId: string, estado: string) => setAnswer(eventId, estado),
}))

const ME = 'me'
const EVENT = 'e1'
const DESDE = '2026-09-19T22:00:00.000Z'
const KEY = homeKeys.summaries([EVENT, 'e2'], DESDE)

const OTHER = { user_id: 'other', avatar_url: null, created_at: '2026-09-19T10:00:00Z' }

function summary(over: Partial<EventSummary> = {}): EventSummary {
  return { ...emptySummary(EVENT), going: 1, faces: [OTHER], ...over }
}

let client: QueryClient

function setup() {
  client.setQueryData<EventSummary[]>(KEY, [summary(), summary({ event_id: 'e2' })])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <UserIdContext.Provider value={ME}>{children}</UserIdContext.Provider>
    </QueryClientProvider>
  )
  return renderHook(() => useAnswer(), { wrapper })
}

const summaryIn = (event = EVENT, key: readonly unknown[] = KEY) =>
  client.getQueryData<EventSummary[]>(key)?.find((s) => s.event_id === event)
const mine = (event = EVENT) => summaryIn(event)?.mine ?? null

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  setAnswer.mockReset()
})
afterEach(() => {
  onlineManager.setOnline(true)
})

describe('useAnswer', () => {
  it('la fila diu «sí» a l’instant, abans que contesti el servidor', async () => {
    const call = deferred<AnswerResult>()
    setAnswer.mockReturnValue(call.promise)
    const { result } = setup()

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })

    await waitFor(() => {
      expect(mine()).toBe('si')
    })
    expect(setAnswer).toHaveBeenCalledWith(EVENT, 'si')
    call.resolve({ estado: 'si', ple: false, posicio: null })
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(mine()).toBe('si')
  })

  it('l’estat final és el que torna la crida: llista d’espera si estava ple', async () => {
    const call = deferred<AnswerResult>()
    setAnswer.mockReturnValue(call.promise)
    const { result } = setup()

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })
    await waitFor(() => {
      expect(mine()).toBe('si')
    })
    call.resolve({ estado: 'espera', ple: true, posicio: 3 })
    await waitFor(() => {
      expect(mine()).toBe('espera')
    })
  })

  it('mostra l’estat esperat quan la pantalla ja sap que està ple', async () => {
    setAnswer.mockReturnValue(deferred<AnswerResult>().promise)
    const { result } = setup()

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si', expected: 'espera' })
    })
    await waitFor(() => {
      expect(mine()).toBe('espera')
    })
  })

  it('si falla, torna a com estava', async () => {
    const call = deferred<AnswerResult>()
    setAnswer.mockReturnValue(call.promise)
    const { result } = setup()

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })
    await waitFor(() => {
      expect(mine()).toBe('si')
    })
    call.reject(new Error('boom'))
    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(summaryIn()).toEqual(summary())
  })

  it('sense xarxa no diu res que no hagi sortit', async () => {
    onlineManager.setOnline(false)
    setAnswer.mockResolvedValue({ estado: 'si', ple: false, posicio: null })
    const { result } = setup()

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })
    await waitFor(() => {
      expect(result.current.isPaused).toBe(true)
    })
    expect(mine()).toBeNull()
    expect(setAnswer).not.toHaveBeenCalled()
  })
  it("desfer un error no trepitja la resposta en vol d'un altre esdeveniment", async () => {
    const first = deferred<AnswerResult>()
    setAnswer.mockReturnValueOnce(first.promise)
    setAnswer.mockReturnValueOnce(deferred<AnswerResult>().promise)
    const { result } = setup()

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })
    await waitFor(() => {
      expect(mine()).toBe('si')
    })
    act(() => {
      result.current.mutate({ eventId: 'e2', estado: 'si' })
    })
    await waitFor(() => {
      expect(mine('e2')).toBe('si')
    })
    first.reject(new Error('boom'))
    await waitFor(() => {
      expect(mine()).toBeNull()
    })
    expect(mine('e2')).toBe('si')
  })

  it('escriu també a la consulta de la fitxa, que és només [id]', async () => {
    setAnswer.mockReturnValue(deferred<AnswerResult>().promise)
    const { result } = setup()
    const sheet = homeKeys.summaries([EVENT], DESDE)
    client.setQueryData<EventSummary[]>(sheet, [summary()])

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })
    await waitFor(() => {
      expect(summaryIn(EVENT, sheet)?.mine).toBe('si')
    })
  })

  it("no toca la consulta d'un altre esdeveniment", async () => {
    setAnswer.mockReturnValue(deferred<AnswerResult>().promise)
    const { result } = setup()
    const elsewhere = homeKeys.summaries(['e9'], DESDE)
    client.setQueryData<EventSummary[]>(elsewhere, [])

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })
    await waitFor(() => {
      expect(mine()).toBe('si')
    })
    expect(client.getQueryData<EventSummary[]>(elsewhere)).toEqual([])
  })

  it('el recompte puja i la meva cara hi surt, amb la foto del perfil', async () => {
    setAnswer.mockReturnValue(deferred<AnswerResult>().promise)
    const { result } = setup()
    client.setQueryData(profileKeys.of(ME), { nombre: 'Alfa', avatar_url: 'a/me.jpg' })

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })
    await waitFor(() => {
      expect(summaryIn()?.going).toBe(2)
    })
    expect(summaryIn()?.faces[0]).toMatchObject({ user_id: ME, avatar_url: 'a/me.jpg' })
  })

  it('si falla, el recompte i les cares tornen a com eren', async () => {
    const call = deferred<AnswerResult>()
    setAnswer.mockReturnValue(call.promise)
    const { result } = setup()

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })
    await waitFor(() => {
      expect(summaryIn()?.going).toBe(2)
    })
    call.reject(new Error('boom'))
    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(summaryIn()?.going).toBe(1)
    expect(summaryIn()?.faces).toEqual([OTHER])
  })

  it("en acabar recarrega amb filtre: els resums i la llista d'espera", async () => {
    setAnswer.mockResolvedValue({ estado: 'si', ple: false, posicio: null })
    const { result } = setup()
    const spy = vi.spyOn(client, 'invalidateQueries')

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    const filters = spy.mock.calls.map(([f]) => f?.queryKey)
    expect(filters).toContainEqual(['home', 'summaries'])
    expect(filters).toContainEqual(eventKeys.waitlist(EVENT))
    expect(filters).not.toContain(undefined)
  })
})
