import { describe, expect, it } from 'vitest'

import type { MemberNight } from './api'
import { pastNights, sortNights } from './nights'

/**
 * La que importa és la tercera: dues activitats el mateix minut.
 *
 * Sense desempat, l'ordre que arriba de PostgREST és el que decideixi el
 * planificador aquella vegada, i la llista es reordena sola entre dues
 * càrregues de la mateixa pantalla.
 */
function nit(event_id: string, starts_at: string, ends_at: string | null = null): MemberNight {
  return { event_id, starts_at, ends_at, tipo: 'fiesta', titol: null }
}

describe('l’ordre de les activitats d’un soci', () => {
  it('posa la més recent a dalt', () => {
    const rows = [
      nit('a', '2026-01-10T20:00:00Z'),
      nit('b', '2026-03-02T20:00:00Z'),
      nit('c', '2025-11-30T20:00:00Z'),
    ]
    expect(sortNights(rows).map((r) => r.event_id)).toEqual(['b', 'a', 'c'])
  })

  it('desempata pel mateix identificador sempre', () => {
    const uns = [nit('z', '2026-02-01T20:00:00Z'), nit('a', '2026-02-01T20:00:00Z')]
    const altres = [nit('a', '2026-02-01T20:00:00Z'), nit('z', '2026-02-01T20:00:00Z')]
    expect(sortNights(uns).map((r) => r.event_id)).toEqual(['a', 'z'])
    expect(sortNights(altres).map((r) => r.event_id)).toEqual(['a', 'z'])
  })

  it('no toca la llista que rep', () => {
    const rows = [nit('a', '2026-01-10T20:00:00Z'), nit('b', '2026-03-02T20:00:00Z')]
    sortNights(rows)
    expect(rows.map((r) => r.event_id)).toEqual(['a', 'b'])
  })

  it('amb cap activitat torna una llista buida', () => {
    expect(sortNights([])).toEqual([])
  })
})

/**
 * El cas que va obligar a escriure `pastNights`: `close_meeting()` posa
 * `asistio` a una reunió futura i «ON HA ESTAT» l'ensenyava.
 */
describe('quines activitats són «on ha estat»', () => {
  const ARA = Date.parse('2026-09-18T12:00:00Z')

  it('treu la que encara no ha començat', () => {
    const rows = [nit('passat', '2026-09-10T20:00:00Z'), nit('futur', '2026-09-21T20:00:00Z')]
    expect(pastNights(rows, ARA).map((r) => r.event_id)).toEqual(['passat'])
  })

  it('encara no hi posa la que s’està celebrant ara mateix', () => {
    // Va començar fa dues hores i no té `ends_at`: `InsideScreen` encara hi
    // pinta el punt de «ara mateix», i les dues pantalles no es contradiuen.
    const rows = [nit('en_marxa', '2026-09-18T10:00:00Z')]
    expect(pastNights(rows, ARA)).toEqual([])
  })

  it('i la hi posa quan han passat les sis hores', () => {
    const rows = [nit('en_marxa', '2026-09-18T10:00:00Z')]
    expect(pastNights(rows, ARA + 5 * 3_600_000).map((r) => r.event_id)).toEqual(['en_marxa'])
  })

  it('amb ends_at mana ends_at', () => {
    // Una reunió d'una hora ja s'ha acabat molt abans de les sis.
    const rows = [nit('curta', '2026-09-18T10:00:00Z', '2026-09-18T11:00:00Z')]
    expect(pastNights(rows, ARA).map((r) => r.event_id)).toEqual(['curta'])
  })

  it('no toca la llista que rep', () => {
    const rows = [nit('futur', '2026-09-21T20:00:00Z')]
    pastNights(rows, ARA)
    expect(rows).toHaveLength(1)
  })
})
