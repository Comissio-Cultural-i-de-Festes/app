import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type FakeControl, installFakeIndexedDb } from '../../tests/fakeIndexedDb'

import type * as Queue from './queue'

/**
 * Obrir la base local, i dir si s'ha pogut desar.
 *
 * EL QUE VA OBRIR AIXÒ: l'obertura es memoritzava per a tota la vida de la
 * pàgina, l'error inclòs. Un cop que fallava o quedava bloquejada —el dia que
 * es puja la versió amb una pestanya vella oberta— no es tornava a provar, no
 * es desava res més, i `enqueue` tornava igual de content. La porta deia «en
 * cua» d'escanejos que no eren enlloc.
 *
 * Cada prova fa un IndexedDB nou i torna a importar el mòdul, perquè el que es
 * prova és precisament l'estat que el mòdul es guarda entre crides.
 */

let control: FakeControl
let queue: typeof Queue

const scan = (id: string) => ({
  clientRequestId: id,
  eventId: '00000000-0000-4000-8000-0000000000e1',
  qrToken: null,
  userId: null,
  at: Date.now(),
  tries: 0,
})

/** Deixa córrer les microtasques de l'IndexedDB de prova. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(async () => {
  control = installFakeIndexedDb()
  vi.resetModules()
  queue = await import('./queue')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('desar', () => {
  it('diu que sí quan ha desat', async () => {
    await expect(queue.enqueue(scan('a'))).resolves.toBe(true)
    expect(await queue.pending()).toHaveLength(1)
  })

  it('diu que no quan el disc refusa l’escriptura', async () => {
    control.refuseWrites = true
    await expect(queue.enqueue(scan('a'))).resolves.toBe(false)
    await expect(queue.put(queue.IDEAS, { id: 'i', at: 0, tries: 0 })).resolves.toBe(false)
  })

  it('diu que no quan no hi ha IndexedDB', async () => {
    Reflect.deleteProperty(globalThis, 'indexedDB')
    vi.resetModules()
    queue = await import('./queue')
    await expect(queue.enqueue(scan('a'))).resolves.toBe(false)
  })
})

describe('obrir la base', () => {
  it('torna a provar-ho després d’una obertura que falla', async () => {
    control.failOpens(1)
    await expect(queue.enqueue(scan('a'))).resolves.toBe(false)

    await expect(queue.enqueue(scan('b'))).resolves.toBe(true)
    expect((await queue.pending()).map((row) => row.clientRequestId)).toEqual(['b'])
  })

  it('no s’hi queda penjada si l’obertura no contesta mai', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    control.hangOpens(1)

    const first = queue.enqueue(scan('a'))
    await vi.advanceTimersByTimeAsync(queue.OPEN_DEADLINE_MS)
    await expect(first).resolves.toBe(false)

    vi.useRealTimers()
    await expect(queue.enqueue(scan('b'))).resolves.toBe(true)
  })

  it('tanca la connexió quan una pestanya nova puja la versió, i no la bloqueja', async () => {
    await queue.enqueue(scan('a'))

    const blocked = vi.fn()
    const newer = indexedDB.open('comi', 1000)
    newer.onblocked = blocked
    const opened = new Promise((resolve) => {
      newer.onsuccess = resolve
    })
    await opened
    expect(blocked).not.toHaveBeenCalled()

    // La pestanya vella continua desant, ara a la base de la nova.
    await expect(queue.enqueue(scan('b'))).resolves.toBe(true)
    expect(await queue.pending()).toHaveLength(2)
  })

  it('diu que no mentre una pestanya vella la bloqueja, i desa quan plega', async () => {
    // Una pestanya amb el codi d'abans: té la base oberta a una versió més
    // baixa i no escolta `versionchange`.
    const older = indexedDB.open('comi', 1)
    const oldTab = await new Promise<IDBDatabase>((resolve) => {
      older.onsuccess = () => {
        resolve(older.result)
      }
    })

    await expect(queue.enqueue(scan('a'))).resolves.toBe(false)
    // La segona no s'encua darrere de la bloquejada, que no contestaria mai.
    const opens = control.opens
    await expect(queue.enqueue(scan('b'))).resolves.toBe(false)
    expect(control.opens).toBe(opens)

    oldTab.close()
    await settle()

    await expect(queue.enqueue(scan('c'))).resolves.toBe(true)
    expect((await queue.pending()).map((row) => row.clientRequestId)).toEqual(['c'])
  })
})

describe('apartar una entrada que el servidor refusa', () => {
  it('la marca amb el codi i la deixa a la cua', async () => {
    await queue.enqueue(scan('a'))
    await queue.setRefused('a', '22P02')
    expect(await queue.pending()).toMatchObject([{ clientRequestId: 'a', refused: '22P02' }])
  })

  it('i la torna a la cua quan se li treu la marca', async () => {
    await queue.enqueue(scan('a'))
    await queue.setRefused('a', '22P02')
    await queue.setRefused('a', null)
    const [row] = await queue.pending()
    expect(row).toBeDefined()
    expect(row?.refused).toBeUndefined()
  })

  it('no reviu una entrada que algú ha tret', async () => {
    await queue.setRefused('ningú', '22P02')
    expect(await queue.pending()).toEqual([])
  })
})
