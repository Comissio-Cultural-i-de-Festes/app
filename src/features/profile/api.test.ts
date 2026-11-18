import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Que desar la foto de perfil passi sempre per `avatarImage`.
 *
 * Abans només es re-codificava quan el que arribava era un `File`, i amb la
 * mida de les portades: un avatar de 400 kB que es pinta a 40 px. Si algú
 * torna a posar `shrinkImage` aquí, o deixa passar un `Blob` tal com és,
 * aquest test cau.
 */

const { avatarImage, uploadAvatar, shrinkImage, update } = vi.hoisted(() => ({
  avatarImage: vi.fn(),
  uploadAvatar: vi.fn(),
  shrinkImage: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({ AVATARS: 'avatars', avatarImage, uploadAvatar, shrinkImage }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (values: unknown) => {
        update(values)
        return {
          eq: () => ({ select: () => Promise.resolve({ data: [{ id: 'u' }], error: null }) }),
        }
      },
    }),
  },
}))

import { setMyPhoto } from './api'

beforeEach(() => {
  vi.clearAllMocks()
  avatarImage.mockResolvedValue(new Blob(['petit'], { type: 'image/jpeg' }))
  uploadAvatar.mockResolvedValue('u/1.jpg')
})

describe('setMyPhoto', () => {
  it.each([
    ['un File', new File(['x'], 'cara.jpg', { type: 'image/jpeg' })],
    ['un Blob', new Blob(['x'], { type: 'image/jpeg' })],
  ])('puja el que torna avatarImage quan arriba %s', async (_nom, entrada) => {
    await setMyPhoto('u', entrada)

    expect(avatarImage).toHaveBeenCalledWith(entrada)
    expect(shrinkImage).not.toHaveBeenCalled()
    const pujat = uploadAvatar.mock.calls[0]?.[0] as Blob
    expect(pujat.size).toBe(5)
    expect(update).toHaveBeenCalledWith({ avatar_url: 'u/1.jpg' })
  })
})
