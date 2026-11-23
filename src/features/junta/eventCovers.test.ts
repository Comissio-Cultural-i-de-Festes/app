import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La portada d'un esdeveniment esborrat se'n va amb ell, i la d'un que es
 * refusa d'esborrar es queda. I substituir-la deixa a la carpeta la nova.
 */

const { keepOnly, rpc } = vi.hoisted(() => ({ keepOnly: vi.fn(), rpc: vi.fn() }))

vi.mock('@/lib/storage', () => ({ COVERS: 'event-covers', keepOnly }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

import { deleteEvent, dropOldCovers } from './eventFormApi'

beforeEach(() => {
  vi.clearAllMocks()
  keepOnly.mockResolvedValue(undefined)
})

describe('deleteEvent', () => {
  it('esborra l’esdeveniment i llavors buida la carpeta de la portada', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await deleteEvent('e')
    expect(rpc).toHaveBeenCalledWith('admin_delete_event', { p_event_id: 'e' })
    expect(keepOnly).toHaveBeenCalledWith('event-covers', 'e', null)
  })

  it('si la base el refusa (té punts), la portada es queda', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'amb punts' } })
    await expect(deleteEvent('e')).rejects.toThrow()
    expect(keepOnly).not.toHaveBeenCalled()
  })
})

describe('dropOldCovers', () => {
  it('deixa a la carpeta només la portada desada', () => {
    dropOldCovers('e', 'e/2.jpg')
    expect(keepOnly).toHaveBeenCalledWith('event-covers', 'e', 'e/2.jpg')
  })
})
