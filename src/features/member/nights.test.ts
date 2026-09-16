import { describe, expect, it } from 'vitest'

import type { MemberNight } from './api'
import { sortNights } from './nights'

/**
 * La que importa és la tercera: dues activitats el mateix minut.
 *
 * Sense desempat, l'ordre que arriba de PostgREST és el que decideixi el
 * planificador aquella vegada, i la llista es reordena sola entre dues
 * càrregues de la mateixa pantalla.
 */
function nit(event_id: string, starts_at: string): MemberNight {
  return { event_id, starts_at, tipo: 'fiesta', titol: null }
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
