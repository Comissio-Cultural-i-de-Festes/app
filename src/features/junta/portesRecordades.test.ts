import { beforeEach, describe, expect, it } from 'vitest'

import type { DoorNow } from './homeApi'
import { PORTA_TRIADA_KEY } from './portes'
import { oblidaLesPortes, portesRecordades, recordaPortes } from './portesRecordades'

/**
 * Les portes desades per obrir l'escàner sense xarxa.
 *
 * El cas: la junta obre l'app en fred a la casa rural, sense cobertura, i
 * l'escàner ha de ser a un toc. El que es fixa és que se'n recorda la casa
 * rural mentre dura, que una festa d'ahir no torna, i que és de qui la va desar.
 */

const ARA = Date.parse('2026-11-28T12:00:00Z')
const HORA = 3_600_000

const porta = (id: string, startsAt: number, endsAt: number | null): DoorNow => ({
  id,
  titulo: `Esdeveniment ${id}`,
  starts_at: new Date(startsAt).toISOString(),
  ends_at: endsAt === null ? null : new Date(endsAt).toISOString(),
  ubicacion: 'Masia inventada',
  plazas: 30,
  diuen_si: 24,
  fitxats: 20,
  esperen: 1,
  no_pagats: 3,
  gimcana_cua: 2,
})

const CASA_ID = '00000000-0000-4000-8000-0000000089c1'
const CASA = porta(CASA_ID, ARA - 20 * HORA, ARA + 30 * HORA)
const FESTA = porta('00000000-0000-4000-8000-0000000089f1', ARA - 30 * HORA, ARA - 24 * HORA)

beforeEach(() => {
  localStorage.clear()
})

describe('les portes recordades', () => {
  it('tornen l’endemà sense xarxa, amb l’hora en què es van desar', () => {
    recordaPortes('u1', [CASA], ARA - 12 * HORA)

    expect(portesRecordades('u1', ARA)).toEqual({
      desat: ARA - 12 * HORA,
      portes: [
        {
          id: CASA_ID,
          titulo: `Esdeveniment ${CASA_ID}`,
          starts_at: CASA.starts_at,
          ends_at: CASA.ends_at,
        },
      ],
    })
  })

  it('i no desen cap número: un número d’ahir es llegiria com d’ara', () => {
    recordaPortes('u1', [CASA], ARA)
    const raw = localStorage.getItem('comi.junta.portes.u1') ?? ''

    expect(raw).not.toContain('no_pagats')
    expect(raw).not.toContain('diuen_si')
  })

  it('treuen la que ja ha sortit de la finestra', () => {
    recordaPortes('u1', [FESTA, CASA], ARA - 12 * HORA)

    expect(portesRecordades('u1', ARA)?.portes.map((p) => p.id)).toEqual([CASA_ID])
  })

  it('i no en donen cap si totes han sortit', () => {
    recordaPortes('u1', [FESTA], ARA - 26 * HORA)

    expect(portesRecordades('u1', ARA)).toBeNull()
  })

  it('són de qui les va desar', () => {
    recordaPortes('u1', [CASA], ARA)

    expect(portesRecordades('u2', ARA)).toBeNull()
  })

  it('una resposta sense portes esborra les d’abans', () => {
    recordaPortes('u1', [CASA], ARA - HORA)
    recordaPortes('u1', [], ARA)

    expect(portesRecordades('u1', ARA)).toBeNull()
  })

  it('i el que no s’entén és com si no hi fos', () => {
    localStorage.setItem('comi.junta.portes.u1', '{"desat":"ahir","portes":[1]}')
    expect(portesRecordades('u1', ARA)).toBeNull()

    localStorage.setItem('comi.junta.portes.u1', 'no és json')
    expect(portesRecordades('u1', ARA)).toBeNull()
  })

  // El que es llegeix d'aquí es pinta a la pantalla d'error, que és la que es
  // veu quan no hi ha res més: cap valor estrany no hi pot fer petar res.
  const desat = (over: Record<string, unknown>, porta: Record<string, unknown> = {}) => {
    localStorage.setItem(
      'comi.junta.portes.u1',
      JSON.stringify({
        desat: ARA - HORA,
        portes: [
          { id: CASA_ID, titulo: 'X', starts_at: CASA.starts_at, ends_at: CASA.ends_at, ...porta },
        ],
        ...over,
      }),
    )
    return portesRecordades('u1', ARA)
  }

  it('i una hora de desat que no és una data no passa, encara que sigui un número', () => {
    // `1e300` és finit, però `new Date(1e300)` és invàlida i `formatTime` hi peta.
    expect(desat({ desat: 1e300 })).toBeNull()
    expect(desat({ desat: Number.NaN })).toBeNull()
    expect(desat({})).not.toBeNull()
  })

  it('ni unes hores de l’esdeveniment que no són dates', () => {
    expect(desat({}, { starts_at: 'dissabte' })).toBeNull()
    expect(desat({}, { ends_at: 'diumenge' })).toBeNull()
  })

  it('ni un id que no és un uuid, perquè va a parar a una adreça', () => {
    expect(desat({}, { id: '../../perfil' })).toBeNull()
    expect(desat({}, { id: 'casa' })).toBeNull()
  })
})

describe('en tancar la sessió', () => {
  it('s’esborren les portes de tothom i la tria de porta, i res més', () => {
    recordaPortes('u1', [CASA], ARA)
    recordaPortes('u2', [CASA], ARA)
    localStorage.setItem(PORTA_TRIADA_KEY, CASA_ID)
    localStorage.setItem('comi.locale', 'ca')

    oblidaLesPortes()

    expect(portesRecordades('u1', ARA)).toBeNull()
    expect(portesRecordades('u2', ARA)).toBeNull()
    expect(localStorage.getItem(PORTA_TRIADA_KEY)).toBeNull()
    expect(localStorage.getItem('comi.locale')).toBe('ca')
  })
})
