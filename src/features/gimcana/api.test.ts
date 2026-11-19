import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isPermanent } from '@/lib/db'
import { errorKey } from '@/lib/errors'
import type * as Queue from '@/lib/queue'

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

const encode = vi.fn((b: Blob) => Promise.resolve(b))
const putFails = { on: false }

vi.mock('@/lib/storage', () => ({
  GIMCANA_PHOTOS: 'gimcana-photos',
  galleryImage: (b: Blob) => encode(b),
  UnreadableImage: class UnreadableImage extends Error {},
}))

vi.mock('@/lib/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof Queue>()),
  PROVES: 'gimcana-queue',
  put: (_s: string, item: { id: string; tries: number }) => {
    if (putFails.on) return Promise.resolve(false)
    store.set(item.id, item)
    return Promise.resolve(true)
  },
  drop: (_s: string, id: string) => {
    store.delete(id)
    return Promise.resolve(true)
  },
  waiting: () => Promise.resolve([...store.values()]),
}))

const { flushProves, submitProva, NotSaved } = await import('./api')

const PROVA = '00000000-0000-4000-8000-0000000000a1'
const USER = '00000000-0000-4000-8000-0000000000b1'
const photo = new Blob(['x'], { type: 'image/jpeg' })

beforeEach(() => {
  store.clear()
  putFails.on = false
  encode.mockReset()
  encode.mockImplementation((b: Blob) => Promise.resolve(b))
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

  // `submit_prova` (migració 95) només accepta aquest camí, lletra per
  // lletra: la carpeta de la prova, la de qui envia i un uuid. Si el client
  // l'escrivís d'una altra manera, totes les proves tornarien un 22023.
  it('puja i envia el mateix camí, amb la forma que demana el servidor', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null })

    await submitProva(PROVA, photo)

    const args = rpc.mock.calls[0]?.[1] as { p_path: string; p_client_request_id: string }
    expect(upload.mock.calls[0]?.[0]).toBe(args.p_path)
    expect(args.p_path).toBe(`${PROVA}/${USER}/${args.p_client_request_id}.jpg`)
    expect(args.p_client_request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  // Un camí que el servidor no reconeix no és una xarxa caiguda: el botó ho
  // ha de dir, i no l'avís de «desada, sortirà sola».
  it('un camí refusat surt com a refús, amb la seva pista', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null })
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'cami de foto no valid', hint: 'prova_foto' },
    })

    const err: unknown = await submitProva(PROVA, photo).catch((e: unknown) => e)

    expect(isPermanent(err)).toBe(true)
    expect(errorKey(err, true)).toBe('errors.provaFoto')
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

  // Vist contra la passarel·la local: amb la sessió perduda la petició surt
  // com a `anon`, que no pot executar `submit_prova`, i la resposta és 42501
  // «permission denied for function». És de qui crida, no de la foto: quan
  // torna la sessió, la mateixa foto entra. Esborrar-la era perdre-la.
  it('un 42501 de qui crida no esborra la foto: es queda i suma un intent', async () => {
    store.set('r2', { id: 'r2', tries: 0, provaId: PROVA, photo } as never)
    getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null })
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for function submit_prova' },
    })

    expect(await flushProves()).toBe(0)

    expect(store.get('r2')?.tries).toBe(1)
  })

  // La mateixa foto tornaria a fer el mateix camí: reintentar-la cada quinze
  // segons seria encallar la cua per sempre.
  it('un camí de foto refusat també la treu', async () => {
    store.set('r4', { id: 'r4', tries: 0, provaId: PROVA, photo } as never)
    getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null })
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'cami de foto no valid', hint: 'prova_foto' },
    })

    expect(await flushProves()).toBe(0)

    expect(store.has('r4')).toBe(false)
  })

  it('un refús de la petició mateixa sí que la treu: no entrarà mai', async () => {
    store.set('r3', { id: 'r3', tries: 0, provaId: PROVA, photo } as never)
    getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null })
    rpc.mockResolvedValue({ data: null, error: { code: '22P02', message: 'invalid input' } })

    expect(await flushProves()).toBe(0)

    expect(store.has('r3')).toBe(false)
  })
})

describe('enviaments concurrents', () => {
  function slowUpload() {
    let release: () => void = () => undefined
    upload.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ error: null })
        }),
    )
    return () => release()
  }

  it('dues buidades alhora pugen cada foto una sola vegada', async () => {
    store.set('r1', { id: 'r1', tries: 0, provaId: PROVA, photo } as never)
    getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null })
    const release = slowUpload()

    const a = flushProves()
    const b = flushProves()
    await vi.waitFor(() => expect(upload).toHaveBeenCalled())
    release()
    await Promise.all([a, b])

    expect(upload).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('una prova que s’està enviant no la torna a enviar la buidada', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null })
    const release = slowUpload()

    const sending = submitProva(PROVA, photo)
    await vi.waitFor(() => expect(upload).toHaveBeenCalled())
    const flushed = flushProves()
    release()
    await Promise.all([sending, flushed])

    expect(upload).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('el que no ha arribat a desar-se', () => {
  // «Desada, s'enviarà sola» només és veritat si la foto és a la cua. Un error
  // abans del `put` ha de sortir com a tal, no com una xarxa caiguda.
  it('un canvas que falla surt com a no desada, sense res a la cua', async () => {
    encode.mockRejectedValue(new Error('no canvas'))

    await expect(submitProva(PROVA, photo)).rejects.toBeInstanceOf(NotSaved)

    expect(store.size).toBe(0)
    expect(upload).not.toHaveBeenCalled()
  })

  // El `put` real de la cua no peta: sense IndexedDB torna `false`.
  it("un IndexedDB que no desa, amb l'enviament fallat, surt com a no desada", async () => {
    putFails.on = true
    getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null })
    upload.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(submitProva(PROVA, photo)).rejects.toBeInstanceOf(NotSaved)
  })

  it('un enviament fallat amb la foto a la cua continua sent «a la cua»', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null })
    upload.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(submitProva(PROVA, photo)).rejects.not.toBeInstanceOf(NotSaved)

    expect(store.size).toBe(1)
  })
})
