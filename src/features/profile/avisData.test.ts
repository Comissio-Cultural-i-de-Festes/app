import { describe, expect, it } from 'vitest'

import { volAny } from './avisData'

/**
 * La prova ha de mossegar pel cas que va obrir el forat, no per un de fàcil.
 *
 * El que l'issue descriu és exactament aquest: dos avisos separats un any, tots
 * dos dins de la lectura de la targeta —perquè el període `global` no té data
 * de final i la finestra és `[inici, ∞)`— i pintats iguals. La primera
 * asserció d'aquí sota és aquell parell, i falla amb qualsevol implementació
 * que digui sempre que no. La resta fixa els dos extrems: el cas normal no ha
 * de perdre el dia, i el límit és el que és.
 *
 * Dates inventades i rellotge injectat: sense `ara` com a paràmetre, aquest
 * fitxer aniria canviant de significat cada dia que passa.
 */

const ARA = new Date('2026-09-19T10:00:00Z')

describe('volAny', () => {
  it('separa el parell que es confonia: dos 4 de novembre a un any de distància', () => {
    const vell = '2024-11-04T21:00:00Z'
    const nou = '2025-11-04T21:00:00Z'

    // El de fa gairebé un any encara es pot datar amb dia i mes; el de fa dos
    // no. Sense això, els dos sortien «4 de nov.» un sota l'altre.
    expect(volAny(nou, ARA)).toBe(false)
    expect(volAny(vell, ARA)).toBe(true)
    expect(volAny(nou, ARA)).not.toBe(volAny(vell, ARA))
  })

  it('i el parell continua separat un any més tard, quan tots dos són vells', () => {
    const mesTard = new Date('2026-12-01T10:00:00Z')
    expect(volAny('2024-11-04T21:00:00Z', mesTard)).toBe(true)
    expect(volAny('2025-11-04T21:00:00Z', mesTard)).toBe(true)
    // Els dos amb any, i l'any els distingeix: «nov. 2024» i «nov. 2025».
  })

  it('deixa el dia a les files d’aquest curs, que són les que es miren', () => {
    expect(volAny('2026-09-18T20:00:00Z', ARA)).toBe(false)
    expect(volAny('2025-10-02T20:00:00Z', ARA)).toBe(false)
    // Un curs va de setembre a agost: al setembre, l'octubre anterior encara
    // és d'aquest curs i no ha de portar l'any.
    expect(volAny('2025-12-24T20:00:00Z', ARA)).toBe(false)
  })

  it('el límit és un any just, i el dia que el toca ja el porta', () => {
    expect(volAny('2025-09-19T10:00:00Z', ARA)).toBe(true)
    expect(volAny('2025-09-19T10:00:01Z', ARA)).toBe(false)
  })

  it('una data del futur no porta l’any', () => {
    expect(volAny('2027-01-01T10:00:00Z', ARA)).toBe(false)
  })
})
