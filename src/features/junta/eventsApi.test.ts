import { describe, expect, it } from 'vitest'

import { horizonIso } from '@/features/home/api'

import { JUNTA_BACK_MS, juntaHorizonIso } from './eventsApi'

/**
 * La finestra enrere de les llistes de la junta.
 *
 * Es prova perquè ha de quadrar amb una altra que viu a SQL: `junta_home()`
 * posa a la porta qualsevol esdeveniment començat fins a vuit hores enrere, i
 * les files «N no han pagat» i «N esperen resposta» que en surten porten a
 * /junta/pagaments/<id>. Amb la finestra de la pantalla de casa —sis hores—
 * aquella pantalla no trobava l'esdeveniment a la seva pròpia llista i
 * responia amb el buit del calendari. Aquí hi ha les dues, l'una al costat de
 * l'altra, perquè el dia que se separin ho digui una prova i no la junta.
 */

const HOUR = 3_600_000
const NOON = Date.parse('2026-09-18T12:00:00.000Z')

describe('la finestra enrere de la junta', () => {
  it('arriba fins a les vuit hores de junta_home()', () => {
    expect(Date.parse(juntaHorizonIso(NOON))).toBeLessThanOrEqual(NOON - JUNTA_BACK_MS)
    expect(JUNTA_BACK_MS).toBe(8 * HOUR)
  })

  it('i abraça l’esdeveniment de fa set hores i mitja, que la de casa deixava fora', () => {
    const faSetHoresIMitja = NOON - 7.5 * HOUR

    expect(Date.parse(juntaHorizonIso(NOON))).toBeLessThan(faSetHoresIMitja)
    expect(Date.parse(horizonIso(NOON))).toBeGreaterThan(faSetHoresIMitja)
  })

  it('i s’arrodoneix a l’hora, per no estrenar clau de cau a cada render', () => {
    expect(juntaHorizonIso(NOON)).toBe(juntaHorizonIso(NOON + 60_000))
    expect(Date.parse(juntaHorizonIso(NOON)) % HOUR).toBe(0)
  })
})
