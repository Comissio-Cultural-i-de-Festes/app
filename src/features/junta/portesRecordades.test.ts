import { beforeEach, describe, expect, it } from 'vitest'

import type { DoorNow } from './homeApi'
import { portesRecordades, recordaPortes } from './portesRecordades'

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

const CASA = porta('casa', ARA - 20 * HORA, ARA + 30 * HORA)
const FESTA = porta('festa', ARA - 30 * HORA, ARA - 24 * HORA)

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
          id: 'casa',
          titulo: 'Esdeveniment casa',
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

    expect(portesRecordades('u1', ARA)?.portes.map((p) => p.id)).toEqual(['casa'])
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
})
