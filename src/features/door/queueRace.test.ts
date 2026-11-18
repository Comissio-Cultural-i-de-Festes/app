import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeIndexedDb } from '../../../tests/fakeIndexedDb'

/**
 * La cua de la porta quan dues coses hi toquen alhora.
 *
 * Amb la cua de debò (sobre un IndexedDB de prova) i no la imitada de
 * `api.test.ts`, perquè el que es prova és precisament què queda escrit.
 *
 * EL CAS QUE VA OBRIR AIXÒ: la junta toca «Desfés» mentre un buidatge té
 * aquell fitxatge en curs. El desfer treu l'entrada i fa enrere la fila; el
 * buidatge, quan se li acaba el temps, apuntava un intent més amb un `put`
 * sense mirar, i l'entrada tornava a la cua. El buidatge següent fitxava la
 * persona de nou, amb punts, i la pantalla deia «fet enrere».
 */

installFakeIndexedDb()

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      const answer = rpc(...args) as Promise<unknown>
      return {
        abortSignal: () => answer,
        then: (ok: (value: unknown) => unknown, ko: (error: unknown) => unknown) =>
          answer.then(ok, ko),
      }
    },
  },
}))

const { bumpTries, clearAllQueues, enqueue, pending } = await import('@/lib/queue')
const { DOOR_TIMEOUT_MS, flushQueue, undo } = await import('./api')

const EVENT = '00000000-0000-4000-8000-0000000000e1'
const USER = '00000000-0000-4000-8000-0000000000a1'

const entry = (id: string) => ({
  clientRequestId: id,
  eventId: EVENT,
  qrToken: null,
  userId: USER,
  at: Date.now(),
  tries: 0,
})

const hanging = () => new Promise<never>(() => undefined)

beforeEach(async () => {
  await clearAllQueues()
  rpc.mockReset()
  // Només els temporitzadors: l'IndexedDB de prova va per microtasques.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('un intent més apuntat a la cua', () => {
  it('compta un intent si l’entrada hi és', async () => {
    await enqueue(entry('a'))
    await bumpTries(entry('a'))
    expect(await pending()).toMatchObject([{ clientRequestId: 'a', tries: 1 }])
  })

  it('no torna a posar una entrada que algú ha tret mentrestant', async () => {
    await enqueue(entry('b'))
    const seenBySender = (await pending())[0]!
    await clearAllQueues()

    await bumpTries(seenBySender)

    expect(await pending()).toEqual([])
  })
})

describe('desfer mentre el buidatge espera resposta', () => {
  it('la cua queda buida i ningú no torna a fitxar la persona', async () => {
    await enqueue(entry('c'))
    rpc.mockImplementation((name: string) =>
      name === 'check_in' ? hanging() : Promise.resolve({ data: null, error: null }),
    )

    const flushing = flushQueue()
    await vi.advanceTimersByTimeAsync(10)
    expect(rpc).toHaveBeenCalledWith('check_in', expect.anything())

    await undo({ kind: 'unsure', clientRequestId: 'c', eventId: EVENT, userId: USER })
    await vi.advanceTimersByTimeAsync(DOOR_TIMEOUT_MS)
    await flushing

    expect(await pending()).toEqual([])

    rpc.mockClear()
    await expect(flushQueue()).resolves.toEqual({ sent: 0, left: 0 })
    expect(rpc).not.toHaveBeenCalledWith('check_in', expect.anything())
  })
})
