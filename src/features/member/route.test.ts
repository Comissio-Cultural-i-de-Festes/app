import { describe, expect, it } from 'vitest'

import { memberPath, readFrom } from './route'

/**
 * El que aquest fitxer vigila és la fletxa de tornar.
 *
 * `location.state` és `unknown` i arriba de la navegació, o sigui d'una cosa
 * que una pàgina pot fabricar: `navigate('/soci/x', { state: { from:
 * 'https://…' } })`. Si passés tal qual, l'única sortida de la pantalla —el
 * control que la gent prem sense llegir-lo— portaria fora de l'app.
 */
describe('d’on ve qui obre un perfil', () => {
  it('accepta un camí d’aquesta app', () => {
    expect(readFrom({ from: '/esdeveniment/abc/dins', fromLabel: 'Festa' })).toEqual({
      from: '/esdeveniment/abc/dins',
      fromLabel: 'Festa',
    })
  })

  it('conserva la query, que és part d’on s’era', () => {
    expect(readFrom({ from: '/ranquing?p=t2' }).from).toBe('/ranquing?p=t2')
  })

  it('rebutja una adreça externa', () => {
    expect(readFrom({ from: 'https://exemple.test/x' }).from).toBeUndefined()
  })

  it('rebutja el camí sense esquema, que també surt del lloc', () => {
    expect(readFrom({ from: '//exemple.test/x' }).from).toBeUndefined()
  })

  it('rebutja el que no és text', () => {
    expect(readFrom({ from: 42, fromLabel: {} })).toEqual({})
  })

  it('tracta una etiqueta buida com cap etiqueta', () => {
    expect(readFrom({ from: '/idees', fromLabel: '' })).toEqual({ from: '/idees' })
  })

  it('amb un estat que no és un objecte no diu res', () => {
    expect(readFrom(null)).toEqual({})
    expect(readFrom(undefined)).toEqual({})
    expect(readFrom('/ranquing')).toEqual({})
  })
})

describe('el camí del perfil', () => {
  it('s’escriu en un sol lloc', () => {
    expect(memberPath('00000000-0000-4000-8000-000000000001')).toBe(
      '/soci/00000000-0000-4000-8000-000000000001',
    )
  })
})
