import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Que desar la foto de perfil passi sempre per `avatarImage`.
 *
 * Abans només es re-codificava quan el que arribava era un `File`, i amb la
 * mida de les portades: un avatar de 400 kB que es pinta a 40 px. Si algú
 * torna a posar `shrinkImage` aquí, o deixa passar un `Blob` tal com és,
 * aquest test cau.
 */

const { avatarImage, uploadAvatar, shrinkImage, update, keepOnly, updateFails } = vi.hoisted(
  () => ({
    avatarImage: vi.fn(),
    uploadAvatar: vi.fn(),
    shrinkImage: vi.fn(),
    update: vi.fn(),
    keepOnly: vi.fn(),
    updateFails: { yes: false },
  }),
)

vi.mock('@/lib/storage', () => ({
  AVATARS: 'avatars',
  avatarImage,
  uploadAvatar,
  shrinkImage,
  keepOnly,
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (values: unknown) => {
        update(values)
        return {
          eq: () => ({
            select: () =>
              Promise.resolve(
                updateFails.yes
                  ? { data: null, error: { code: '42501', message: 'no' } }
                  : { data: [{ id: 'u' }], error: null },
              ),
          }),
        }
      },
    }),
  },
}))

import { clearMyPhoto, setMyPhoto } from './api'

beforeEach(() => {
  vi.clearAllMocks()
  avatarImage.mockResolvedValue(new Blob(['petit'], { type: 'image/jpeg' }))
  uploadAvatar.mockResolvedValue('u/1.jpg')
  keepOnly.mockResolvedValue(undefined)
  updateFails.yes = false
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

/**
 * L'avatar anterior se'n va, però només quan el perfil ja apunta al nou.
 *
 * L'ordre és el que importa: esborrar abans de desar, i que desar fallés,
 * deixaria el perfil apuntant a una foto que ja no existeix.
 */
describe('setMyPhoto i l’avatar anterior', () => {
  it('puja, desa la columna i llavors deixa a la carpeta només el nou', async () => {
    const order: string[] = []
    uploadAvatar.mockImplementation(() => {
      order.push('upload')
      return Promise.resolve('u/1.jpg')
    })
    update.mockImplementation(() => order.push('update'))
    keepOnly.mockImplementation(() => {
      order.push('keepOnly')
      return Promise.resolve()
    })

    await setMyPhoto('u', new Blob(['x'], { type: 'image/jpeg' }))

    expect(order).toEqual(['upload', 'update', 'keepOnly'])
    expect(keepOnly).toHaveBeenCalledWith('avatars', 'u', 'u/1.jpg')
  })

  it('si la columna no es desa, no esborra res', async () => {
    updateFails.yes = true
    await expect(setMyPhoto('u', new Blob(['x'], { type: 'image/jpeg' }))).rejects.toThrow()
    expect(keepOnly).not.toHaveBeenCalled()
  })
})

describe('clearMyPhoto', () => {
  it('posa la columna a null i buida la carpeta', async () => {
    await clearMyPhoto('u')
    expect(update).toHaveBeenCalledWith({ avatar_url: null })
    expect(keepOnly).toHaveBeenCalledWith('avatars', 'u', null)
  })
})
