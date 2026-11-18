import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Queue from '@/lib/queue'

/**
 * El temps màxim de la porta, contra el client de debò.
 *
 * `api.test.ts` imita el constructor de consultes, i per això no podia veure
 * on era el forat: supabase-js demana el token ABANS del `fetch`, i si al
 * token li queda poca vida espera `/token` sense cap límit. Durant aquella
 * espera no hi ha cap petició que l'`abort()` pugui tallar. Passa cada hora, i
 * cada cop que un iPhone torna a l'app amb el token caducat.
 *
 * Aquí el client és el de veritat, amb `getSession` penjat com quan la
 * renovació no torna, i un `fetch` fals que compta si s'arriba a cridar.
 */

const fetched = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

const client = createClient('http://supabase.invalid', 'anon-inventada', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetched(input, init) },
})

vi.mock('@/lib/supabase', () => ({ supabase: client }))

vi.mock('@/lib/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof Queue>()),
  enqueue: () => Promise.resolve(true),
  dequeue: () => Promise.resolve(true),
  bumpTries: () => Promise.resolve(),
  setRefused: () => Promise.resolve(),
  pending: () => Promise.resolve([]),
}))

const { DOOR_TIMEOUT_MS, DoorTimeout, checkIn, undo } = await import('./api')

const EVENT = '00000000-0000-4000-8000-0000000000e1'
const USER = '00000000-0000-4000-8000-0000000000a1'
const request = {
  clientRequestId: '00000000-0000-4000-8000-0000000000c1',
  eventId: EVENT,
  qrToken: null,
  userId: USER,
}

beforeEach(() => {
  vi.useFakeTimers()
  fetched.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function tokenNeverComes() {
  vi.spyOn(client.auth, 'getSession').mockReturnValue(new Promise(() => undefined))
}

describe('la porta amb la renovació del token penjada', () => {
  it('el fitxatge acaba al temps màxim encara que no hagi sortit cap petició', async () => {
    tokenNeverComes()

    const settled = expect(checkIn(request)).rejects.toBeInstanceOf(DoorTimeout)
    await vi.advanceTimersByTimeAsync(DOOR_TIMEOUT_MS)
    await settled

    expect(fetched).not.toHaveBeenCalled()
  })

  it('i no abans', async () => {
    tokenNeverComes()
    let done = false
    void checkIn(request).catch(() => {
      done = true
    })

    await vi.advanceTimersByTimeAsync(DOOR_TIMEOUT_MS - 1)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
  })

  it('el «Desfés» tampoc no es queda ocupat per sempre', async () => {
    tokenNeverComes()

    const settled = expect(
      undo({ kind: 'row', eventId: EVENT, userId: USER }),
    ).rejects.toBeInstanceOf(DoorTimeout)
    await vi.advanceTimersByTimeAsync(DOOR_TIMEOUT_MS)
    await settled
  })
})

describe('la porta amb el token a punt i la resposta que no arriba', () => {
  it('talla la petició que sí que ha sortit', async () => {
    vi.spyOn(client.auth, 'getSession').mockResolvedValue({
      data: { session: null },
      error: null,
    })
    let aborted = false
    fetched.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new DOMException('aborted', 'AbortError'))
          })
        }),
    )

    const settled = expect(checkIn(request)).rejects.toBeInstanceOf(DoorTimeout)
    await vi.advanceTimersByTimeAsync(DOOR_TIMEOUT_MS)
    await settled

    expect(fetched).toHaveBeenCalledTimes(1)
    expect(aborted).toBe(true)
  })
})
