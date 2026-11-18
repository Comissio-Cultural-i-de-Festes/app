import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La selfie que es refà deixa a la carpeta només la nova, i només quan la fila
 * ja hi apunta. Si la RPC diu que no, la carpeta no es toca: la foto d'abans
 * és la que el díptic encara ensenya.
 */

const { uploadDoorPhoto, keepOnly, rpc, removeStorage } = vi.hoisted(() => ({
  uploadDoorPhoto: vi.fn(),
  keepOnly: vi.fn(),
  rpc: vi.fn(),
  removeStorage: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  DOOR_PHOTOS: 'door-photos',
  uploadDoorPhoto,
  keepOnly,
  removeObjects: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc, storage: { from: () => ({ remove: removeStorage }) } },
}))

import { saveEntryPhoto, saveExitPhoto } from './api'

const photo = new Blob(['x'], { type: 'image/jpeg' })

beforeEach(() => {
  vi.clearAllMocks()
  keepOnly.mockResolvedValue(undefined)
  removeStorage.mockResolvedValue({ data: [], error: null })
})

describe.each([
  ['sortida', saveExitPhoto],
  ['entrada', saveEntryPhoto],
] as const)('la de %s', (kind, save) => {
  it('puja, la fila hi apunta, i llavors treu la que substitueix', async () => {
    const order: string[] = []
    uploadDoorPhoto.mockImplementation(() => {
      order.push('upload')
      return Promise.resolve(`${kind}/e/u/2.jpg`)
    })
    rpc.mockImplementation(() => {
      order.push('rpc')
      return Promise.resolve({ data: { estat: 'desada' }, error: null })
    })
    keepOnly.mockImplementation(() => {
      order.push('keepOnly')
      return Promise.resolve()
    })

    await save('e', 'u', photo)

    expect(order).toEqual(['upload', 'rpc', 'keepOnly'])
    expect(keepOnly).toHaveBeenCalledWith('door-photos', `${kind}/e/u`, `${kind}/e/u/2.jpg`)
  })

  it('si la RPC la refusa, no toca la carpeta i només treu la nova', async () => {
    uploadDoorPhoto.mockResolvedValue(`${kind}/e/u/2.jpg`)
    rpc.mockResolvedValue({ data: { estat: 'no_hi_vas_ser' }, error: null })

    await expect(save('e', 'u', photo)).rejects.toThrow('no_hi_vas_ser')
    expect(keepOnly).not.toHaveBeenCalled()
    expect(removeStorage).toHaveBeenCalledWith([`${kind}/e/u/2.jpg`])
  })
})
