import { describe, expect, it } from 'vitest'

import { accessOf } from './access'

describe('accessOf', () => {
  it('un soci actiu ho veu i ho pot fer tot', () => {
    expect(accessOf({ estat: 'actiu' })).toEqual({
      known: true,
      active: true,
      pending: false,
      closed: false,
    })
  })

  it('un pendent té la porta tancada i sap on bescanviar el codi', () => {
    expect(accessOf({ estat: 'pendent' })).toEqual({
      known: true,
      active: false,
      pending: true,
      closed: true,
    })
  })

  it('una baixa també la té tancada, però no és un pendent', () => {
    expect(accessOf({ estat: 'baixa' })).toEqual({
      known: true,
      active: false,
      pending: false,
      closed: true,
    })
  })

  it('un perfil que no ha arribat o que ha fallat no tanca res', () => {
    // Amb mala cobertura la petició del perfil pot caure, i un soci actiu no
    // ha de quedar-se sense botons per això.
    expect(accessOf(undefined).closed).toBe(false)
    expect(accessOf(null).closed).toBe(false)
    expect(accessOf(undefined).known).toBe(false)
  })
})
