import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { eventKeys } from '@/features/event/api'
import { UserIdContext } from '@/features/session/context'
import { profileKeys } from '@/features/session/profile'

import type { AnswerResult, AttendanceRow } from './api'
import { homeKeys } from './api'
import { useAnswer } from './useHome'

/**
 * El «sí» és optimista: la fila canvia en prémer, el servidor té l'última
 * paraula i un error ho desfà.
 */

const setAnswer = vi.fn<(eventId: string, estado: string) => Promise<AnswerResult>>()
vi.mock('./api', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  setAnswer: (eventId: string, estado: string) => setAnswer(eventId, estado),
}))

const ME = 'me'
const EVENT = 'e1'
const KEY = homeKeys.attendances([EVENT, 'e2'])

function row(over: Partial<AttendanceRow>): AttendanceRow {
  return {
    user_id: 'other',
    event_id: EVENT,
    estado: 'si',
    created_at: '2026-09-19T10:00:00Z',
    profiles: null,
    ...over,
  }
}

let client: QueryClient

function setup() {
  client.setQueryData<AttendanceRow[]>(KEY, [row({})])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <UserIdContext.Provider value={ME}>{children}</UserIdContext.Provider>
    </QueryClientProvider>
  )
  return renderHook(() => useAnswer(), { wrapper })
}

const mineRow = (event = EVENT) =>
  client.getQueryData<AttendanceRow[]>(KEY)?.find((r) => r.user_id === ME && r.event_id === event)
const mine = (event = EVENT) => mineRow(event)?.estado ?? null

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
    expect(mine()).toBeNull()
    expect(client.getQueryData<AttendanceRow[]>(KEY)).toHaveLength(1)
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
    client.setQueryData<AttendanceRow[]>(homeKeys.attendances([EVENT]), [])

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })
    await waitFor(() => {
      expect(client.getQueryData<AttendanceRow[]>(homeKeys.attendances([EVENT]))?.[0]?.estado).toBe(
        'si',
      )
    })
  })

  it("no toca la consulta d'un altre esdeveniment", async () => {
    setAnswer.mockReturnValue(deferred<AnswerResult>().promise)
    const { result } = setup()
    const elsewhere = homeKeys.attendances(['e9'])
    client.setQueryData<AttendanceRow[]>(elsewhere, [])

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })
    await waitFor(() => {
      expect(mine()).toBe('si')
    })
    expect(client.getQueryData<AttendanceRow[]>(elsewhere)).toEqual([])
  })

  it('la fila nova porta el meu nom i la meva cara', async () => {
    setAnswer.mockReturnValue(deferred<AnswerResult>().promise)
    const { result } = setup()
    client.setQueryData(profileKeys.of(ME), { nombre: 'Alfa', avatar_url: 'a/me.jpg' })

    act(() => {
      result.current.mutate({ eventId: EVENT, estado: 'si' })
    })
    await waitFor(() => {
      expect(mineRow()?.profiles).toEqual({ nombre: 'Alfa', avatar_url: 'a/me.jpg' })
    })
  })

  it("en acabar recarrega amb filtre: les assistències i la llista d'espera", async () => {
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
    expect(filters).toContainEqual(['home', 'attendances'])
    expect(filters).toContainEqual(eventKeys.waitlist(EVENT))
    expect(filters).not.toContain(undefined)
  })
})
