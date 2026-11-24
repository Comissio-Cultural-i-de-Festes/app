import { describe, expect, it } from 'vitest'

import { horizonIso } from './api'
import { alCartell, jaHiVamSer } from './finestra'

/**
 * Quins esdeveniments van a dalt de l'Inici i quins a «L'última vegada».
 *
 * La casa rural és el cas: arriba divendres a les quatre i s'acaba diumenge a
 * les sis. Amb les sis hores comptades des de l'inici, divendres a les deu del
 * vespre ja era «hi vam ser», amb tothom encara a dins. Que els filtres
 * triïn de debò el que diuen ho prova `tests/rls/inici_en_curs.test.ts`
 * contra PostgREST; aquí es prova que surten de la clau de cau i que l'un és
 * el contrari de l'altre.
 */

const NOON = Date.parse('2026-11-27T12:34:56.000Z')
const H = horizonIso(NOON)
const ARA = '2026-11-27T12:00:00.000Z'

describe('el filtre de dalt', () => {
  it('hi deixa el que no té final i ha començat dins de les sis hores, com abans', () => {
    expect(alCartell(H)).toContain(`and(ends_at.is.null,starts_at.gte."${H}")`)
  })

  it('i el que encara no s’ha acabat, sigui quan sigui que va començar', () => {
    expect(alCartell(H)).toBe(`and(ends_at.is.null,starts_at.gte."${H}"),ends_at.gte."${ARA}"`)
  })

  it('surt de la mateixa clau de cau: uns minuts amunt o avall, el mateix filtre', () => {
    expect(alCartell(horizonIso(NOON + 20 * 60_000))).toBe(alCartell(H))
  })
})

describe('el filtre de «L’última vegada»', () => {
  it('és el contrari exacte del de dalt, perquè res no surti a tots dos llocs', () => {
    expect(jaHiVamSer(H)).toBe(`and(ends_at.is.null,starts_at.lt."${H}"),ends_at.lt."${ARA}"`)
  })
})
