import { describe, expect, it } from 'vitest'

import { HIDDEN_TITLE, eventTitle, titleIsHidden } from './title'

describe('el títol d\'un esdeveniment', () => {
  it('surt tal com és quan es pot dir', () => {
    expect(eventTitle('Nit de Cap d\'Any a la Nau')).toBe('Nit de Cap d\'Any a la Nau')
  })

  it('i com a interrogants quan la revelació encara el tapa', () => {
    // El null ve de la vista: `event_title` no li dóna la fila fins a
    // reveal_at, i el left join el deixa buit.
    expect(eventTitle(null)).toBe(HIDDEN_TITLE)
  })

  it('tracta el buit i l\'absent com el mateix cas', () => {
    // No hauria d'arribar mai —la taula té un CHECK i la RPC refusa el blanc—
    // però un espai pintat a 38 px és una pantalla trencada, i costa el mateix
    // ser exacte.
    expect(eventTitle('')).toBe(HIDDEN_TITLE)
    expect(eventTitle('   ')).toBe(HIDDEN_TITLE)
    expect(eventTitle(undefined)).toBe(HIDDEN_TITLE)
  })

  it('no confon un títol que de debò són interrogants', () => {
    // Si algú de la junta bateja una festa «? ? ?», aquell esdeveniment SÍ que
    // està revelat: ha de sortir amb la portada i les places, no amb el compte
    // enrere. Per això `titleIsHidden` mira si hi ha títol i no quin és.
    expect(eventTitle(HIDDEN_TITLE)).toBe(HIDDEN_TITLE)
    expect(titleIsHidden(HIDDEN_TITLE)).toBe(false)
  })

  it('i la decisió va a part del text', () => {
    expect(titleIsHidden(null)).toBe(true)
    expect(titleIsHidden('')).toBe(true)
    expect(titleIsHidden('Sopar de tardor')).toBe(false)
  })
})
