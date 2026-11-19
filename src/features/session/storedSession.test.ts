import { beforeEach, describe, expect, it, vi } from 'vitest'

import { storedUser } from './storedSession'

/**
 * De qui és el mòbil, llegit de la sessió desada encara que no es pugui obrir.
 */

vi.mock('@/lib/supabase', () => ({ AUTH_STORAGE_KEY: 'sb-proves-auth-token' }))

const ID = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  localStorage.clear()
})

describe('storedUser', () => {
  it("llegeix l'identificador i el nom d'una sessió caducada", () => {
    localStorage.setItem(
      'sb-proves-auth-token',
      JSON.stringify({
        access_token: 'x',
        expires_at: 1,
        user: { id: ID, user_metadata: { full_name: 'Persona de Proves' } },
      }),
    )
    expect(storedUser()).toEqual({ id: ID, name: 'Persona de Proves' })
  })

  it('sense nom, només l’identificador', () => {
    localStorage.setItem('sb-proves-auth-token', JSON.stringify({ user: { id: ID } }))
    expect(storedUser()).toEqual({ id: ID, name: null })
  })

  it('res desat, o desat malament, és ningú', () => {
    expect(storedUser()).toBeNull()
    localStorage.setItem('sb-proves-auth-token', '{no és json')
    expect(storedUser()).toBeNull()
    localStorage.setItem('sb-proves-auth-token', JSON.stringify({ user: {} }))
    expect(storedUser()).toBeNull()
  })
})
