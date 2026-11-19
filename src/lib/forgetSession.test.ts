import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { forgetOnUserChange } from './forgetSession'
import { signedKey } from './signedQuery'

/**
 * El telèfon es comparteix: qui entra després no ha de veure res de qui marxa.
 *
 * Ni les dades —el perfil, les assistències, les fotos de porta— ni les URL
 * signades, que són una clau d'accés a la imatge durant una hora.
 */

function filled() {
  const client = new QueryClient()
  client.setQueryData(['profile', 'ana'], { nombre: 'Ana' })
  client.setQueryData(signedKey('door-photos', 'entrada/e/ana/1.jpg'), 'https://cdn.test/1')
  return client
}

describe('forgetOnUserChange', () => {
  it('buida la cau, URL signades incloses, quan es tanca la sessió', () => {
    const client = filled()
    const next = forgetOnUserChange(client, 'ana', null)
    expect(next).toBeNull()
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })

  it('i quan entra una altra persona sense haver tancat', () => {
    const client = filled()
    expect(forgetOnUserChange(client, 'ana', 'bernat')).toBe('bernat')
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })

  it('no toca res si és la mateixa persona, com en renovar el testimoni', () => {
    const client = filled()
    expect(forgetOnUserChange(client, 'ana', 'ana')).toBe('ana')
    expect(client.getQueryCache().getAll()).toHaveLength(2)
  })

  it('ni la primera entrada: no hi havia ningú abans', () => {
    const client = filled()
    expect(forgetOnUserChange(client, null, 'ana')).toBe('ana')
    expect(client.getQueryCache().getAll()).toHaveLength(2)
  })
})
