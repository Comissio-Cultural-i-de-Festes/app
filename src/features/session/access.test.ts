import { describe, expect, it } from 'vitest'

import { accessOf } from './access'

describe('accessOf', () => {
  it('un soci actiu ho veu i ho pot fer tot', () => {
    expect(accessOf({ estat: 'actiu' })).toEqual({ known: true, active: true, pending: false })
  })

  it('un pendent no és actiu i sap on anar a bescanviar el codi', () => {
    expect(accessOf({ estat: 'pendent' })).toEqual({ known: true, active: false, pending: true })
  })

  it('una baixa tampoc veu recomptes, però no és un pendent', () => {
    expect(accessOf({ estat: 'baixa' })).toEqual({ known: true, active: false, pending: false })
  })

  it('mentre el perfil no ha arribat no es pinta res que es pugui desmentir', () => {
    expect(accessOf(undefined)).toEqual({ known: false, active: false, pending: false })
    expect(accessOf(null)).toEqual({ known: false, active: false, pending: false })
  })
})
