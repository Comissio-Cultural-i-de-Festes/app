import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `keepOnly`: deixa a la carpeta el que la fila fa servir, i res més.
 *
 * El que ha de quedar clavat és que no fa caure mai l'acció de qui l'ha
 * cridat —quan s'hi arriba, la foto ja s'ha canviat— i que avisa de què ha
 * tret, perquè la URL signada d'aquell camí no es quedi a la memòria cau.
 */

const { list, remove, rpc, from } = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: { rpc, storage: { from } },
}))

import { STORAGE_REMOVED, keepOnly, storageRemovals, sweepStorage } from './storage'

beforeEach(() => {
  vi.clearAllMocks()
  from.mockReturnValue({ list, remove })
  list.mockResolvedValue({
    data: [
      { name: '100.jpg', id: 'a', created_at: '2026-11-01T10:00:00Z' },
      { name: '200.jpg', id: 'b', created_at: '2026-11-01T11:00:00Z' },
    ],
    error: null,
  })
  remove.mockImplementation((paths: string[]) =>
    Promise.resolve({ data: paths.map((name) => ({ name })), error: null }),
  )
})

describe('keepOnly', () => {
  it('treu de la carpeta tot el que no és el que es queda', async () => {
    await keepOnly('avatars', 'u', 'u/200.jpg')

    expect(list).toHaveBeenCalledWith('u', { limit: 1000 })
    expect(remove).toHaveBeenCalledWith(['u/100.jpg'])
  })

  it('avisa de què ha tret', async () => {
    const heard = vi.fn()
    storageRemovals.addEventListener(STORAGE_REMOVED, heard)
    await keepOnly('avatars', 'u', 'u/200.jpg')
    storageRemovals.removeEventListener(STORAGE_REMOVED, heard)

    const event = heard.mock.calls[0]?.[0] as CustomEvent
    expect(event.detail).toEqual({ bucket: 'avatars', paths: ['u/100.jpg'] })
  })

  it('si no hi ha res a treure, no demana res', async () => {
    list.mockResolvedValue({
      data: [{ name: '200.jpg', id: 'b', created_at: '2026-11-01T11:00:00Z' }],
      error: null,
    })
    await keepOnly('avatars', 'u', 'u/200.jpg')
    expect(remove).not.toHaveBeenCalled()
  })

  it('no llança si la llista falla', async () => {
    list.mockResolvedValue({ data: null, error: new Error('sense xarxa') })
    await expect(keepOnly('avatars', 'u', 'u/200.jpg')).resolves.toBeUndefined()
    expect(remove).not.toHaveBeenCalled()
  })

  it('ni si l’esborrat peta', async () => {
    remove.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(keepOnly('avatars', 'u', 'u/200.jpg')).resolves.toBeUndefined()
  })
})

describe('sweepStorage', () => {
  it('esborra el que torna la base, una crida per bucket', async () => {
    rpc.mockResolvedValue({
      data: [
        { bucket: 'avatars', path: 'u/1.jpg' },
        { bucket: 'gimcana-photos', path: 'p/u/r.jpg' },
        { bucket: 'avatars', path: 'u/2.jpg' },
      ],
      error: null,
    })

    expect(await sweepStorage()).toBe(3)
    expect(rpc).toHaveBeenCalledWith('my_storage_garbage', { p_limit: 1000 })
    expect(from).toHaveBeenCalledWith('avatars')
    expect(from).toHaveBeenCalledWith('gimcana-photos')
    expect(remove).toHaveBeenCalledWith(['u/1.jpg', 'u/2.jpg'])
    expect(remove).toHaveBeenCalledWith(['p/u/r.jpg'])
  })

  it('si no pot preguntar, torna null i no esborra res', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no hi és' } })
    expect(await sweepStorage()).toBeNull()
    expect(remove).not.toHaveBeenCalled()
  })

  it('un bucket que falla no atura els altres', async () => {
    rpc.mockResolvedValue({
      data: [
        { bucket: 'avatars', path: 'u/1.jpg' },
        { bucket: 'event-covers', path: 'e/1.jpg' },
      ],
      error: null,
    })
    remove.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await sweepStorage()).toBe(1)
  })

  const full = Array.from({ length: 1000 }, (_, i) => ({
    bucket: 'gimcana-photos',
    path: `p/u/${String(i)}.jpg`,
  }))

  it('mentre la llista arriba plena hi torna, fins a cinc voltes', async () => {
    rpc.mockResolvedValue({ data: full, error: null })

    expect(await sweepStorage()).toBe(5000)
    expect(rpc).toHaveBeenCalledTimes(5)
  })

  it('i para quan la llista no és plena', async () => {
    rpc
      .mockResolvedValueOnce({ data: full, error: null })
      .mockResolvedValueOnce({ data: full.slice(0, 3), error: null })

    expect(await sweepStorage()).toBe(1003)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('o quan una volta no ha pogut treure res, que donaria la mateixa llista', async () => {
    rpc.mockResolvedValue({ data: full, error: null })
    remove.mockResolvedValue({ data: [], error: null })

    expect(await sweepStorage()).toBe(0)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
