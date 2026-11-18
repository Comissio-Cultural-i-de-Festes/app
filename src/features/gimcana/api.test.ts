import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La cua de proves i el compte d'Auth.
 *
 * El que es fixa aquí és que enviar una foto no pregunta mai a /auth/v1/user:
 * aquell endpoint té límit per IP, i darrere la wifi d'una sala amb
 * dues-centes persones cada reintent hi gastaria quota. L'usuari es llegeix de
 * la sessió local, i sense sessió la foto es queda a la cua.
 */

const getUser = vi.fn()
const getSession = vi.fn()
const upload = vi.fn()
const rpc = vi.fn()
const store = new Map<string, { id: string; tries: number }>()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...a: unknown[]) => getUser(...a) as unknown,
      getSession: (...a: unknown[]) => getSession(...a) as unknown,
    },
    storage: { from: () => ({ upload: (...a: unknown[]) => upload(...a) as unknown }) },
    rpc: (...a: unknown[]) => rpc(...a) as unknown,
  },
}))

vi.mock('@/lib/storage', () => ({
  GIMCANA_PHOTOS: 'gimcana-photos',
  galleryImage: (b: Blob) => Promise.resolve(b),
}))

vi.mock('@/lib/queue', () => ({
  PROVES: 'gimcana-queue',
  put: (_s: string, item: { id: string; tries: number }) => {
    store.set(item.id, item)
    return Promise.resolve()
  },
  drop: (_s: string, id: string) => {
    store.delete(id)
    return Promise.resolve()
  },
  waiting: () => Promise.resolve([...store.values()]),
}))

const { flushProves, submitProva } = await import('./api')

const PROVA = '00000000-0000-4000-8000-0000000000a1'
const USER = '00000000-0000-4000-8000-0000000000b1'
const photo = new Blob(['x'], { type: 'image/jpeg' })

beforeEach(() => {
  store.clear()
  for (const m of [getUser, getSession, upload, rpc]) m.mockReset()
  upload.mockResolvedValue({ error: null })
  rpc.mockResolvedValue({ data: { estat: 'enviada' }, error: null })
})

describe('enviar una prova', () => {
  it('llegeix l’usuari de la sessió local i no crida getUser', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null })

    await submitProva(PROVA, photo)

    expect(getUser).not.toHaveBeenCalled()
    expect(upload.mock.calls[0]?.[0]).toContain(`${PROVA}/${USER}/`)
    expect(store.size).toBe(0)
  })

  it('sense sessió no envia res i la foto es queda a la cua', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })

    await expect(submitProva(PROVA, photo)).rejects.toThrow()

    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(store.size).toBe(1)
  })

  it('si la sessió no es pot llegir (429 en refrescar) tampoc es perd', async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: { status: 429, message: 'rate limit' },
    })

    await expect(submitProva(PROVA, photo)).rejects.toThrow()
    expect(store.size).toBe(1)
  })
})

describe('buidar la cua', () => {
  it('sense sessió la cua es manté i suma un intent', async () => {
    store.set('r1', { id: 'r1', tries: 0, provaId: PROVA, photo } as never)
    getSession.mockResolvedValue({ data: { session: null }, error: null })

    expect(await flushProves()).toBe(0)

    expect(store.get('r1')?.tries).toBe(1)
    expect(getUser).not.toHaveBeenCalled()
  })
})
