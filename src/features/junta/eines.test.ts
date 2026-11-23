import { describe, expect, it } from 'vitest'

import { type EinesDe, einesDe, estatPorta, rutaDe } from './eines'

/**
 * Quines eines surten a la fitxa d'un esdeveniment.
 *
 * L'issue #28: l'escàner, l'alta i els punts només sortien de la porta, i la
 * porta només ensenyava un esdeveniment durant unes hores. Aquí es fixa que
 * surten de la fitxa sense tancar-se mai després, i que cada tipus porta les
 * que hi tenen sentit.
 */

const ARA = Date.parse('2026-11-27T18:00:00Z')
const HORA = 3_600_000

const FESTA: EinesDe = {
  tipo: 'fiesta',
  starts_at: new Date(ARA + 4 * HORA).toISOString(),
  ends_at: new Date(ARA + 9 * HORA).toISOString(),
  published: true,
  precio_cents: 0,
  plazas: null,
  cal_confirmacio: false,
  teGimcana: false,
}

describe('les eines d’una activitat', () => {
  it('una festa publicada té la porta sencera a la fitxa', () => {
    expect(einesDe(FESTA, ARA)).toEqual(['escaner', 'alta', 'punts', 'fitxatges', 'gimcana'])
  })

  it('una casa rural, igual, i amb pagaments perquè té preu', () => {
    expect(einesDe({ ...FESTA, tipo: 'casa_rural', precio_cents: 9000 }, ARA)).toEqual([
      'escaner',
      'alta',
      'punts',
      'pagaments',
      'fitxatges',
      'gimcana',
    ])
  })

  it('pagaments també quan hi ha places o cal confirmació, encara que sigui de franc', () => {
    expect(einesDe({ ...FESTA, plazas: 20 }, ARA)).toContain('pagaments')
    expect(einesDe({ ...FESTA, cal_confirmacio: true }, ARA)).toContain('pagaments')
  })

  it('la cua de la gimcana només si n’hi ha una', () => {
    expect(einesDe({ ...FESTA, teGimcana: true }, ARA)).toEqual([
      'escaner',
      'alta',
      'punts',
      'fitxatges',
      'gimcana',
      'validaGimcana',
    ])
  })

  it('un esborrany es prepara però no obre la porta', () => {
    expect(
      einesDe({ ...FESTA, published: false, precio_cents: 1500, teGimcana: true }, ARA),
    ).toEqual(['fitxatges', 'gimcana'])
  })

  it('una reunió només té qui ha fitxat', () => {
    expect(einesDe({ ...FESTA, tipo: 'reunio', plazas: 10, teGimcana: true }, ARA)).toEqual([
      'fitxatges',
    ])
  })
})

describe('quan', () => {
  it('l’escàner i l’alta s’obren trenta hores abans, com la porta', () => {
    const lluny = { ...FESTA, starts_at: new Date(ARA + 31 * HORA).toISOString() }
    expect(einesDe(lluny, ARA)).toEqual(['punts', 'fitxatges', 'gimcana'])
    expect(estatPorta(lluny, ARA)).toBe('aviat')
    expect(estatPorta({ ...lluny, starts_at: new Date(ARA + 30 * HORA).toISOString() }, ARA)).toBe(
      'oberta',
    )
  })

  it('l’endemà encara es fitxa qui es va quedar sense', () => {
    const ahir = {
      ...FESTA,
      starts_at: new Date(ARA - 24 * HORA).toISOString(),
      ends_at: new Date(ARA - 18 * HORA).toISOString(),
    }
    expect(einesDe(ahir, ARA)).toEqual(['escaner', 'alta', 'punts', 'fitxatges', 'gimcana'])
  })

  it('i set dies després de sortir de la porta l’escàner i l’alta es tanquen; els punts, no', () => {
    // La festa va sortir de la porta vuit hores després de començar, fa set
    // dies i una hora.
    const passada = {
      ...FESTA,
      starts_at: new Date(ARA - 7 * 24 * HORA - 9 * HORA).toISOString(),
      ends_at: new Date(ARA - 7 * 24 * HORA - 5 * HORA).toISOString(),
    }
    expect(estatPorta(passada, ARA)).toBe('tancada')
    expect(einesDe(passada, ARA)).toEqual(['punts', 'fitxatges', 'gimcana'])
  })

  it('i a una casa rural, la setmana compta des que s’acaba, no des que comença', () => {
    const casa = {
      ...FESTA,
      tipo: 'casa_rural' as const,
      starts_at: new Date(ARA - 9 * 24 * HORA).toISOString(),
      ends_at: new Date(ARA - 6 * 24 * HORA).toISOString(),
    }
    expect(estatPorta(casa, ARA)).toBe('oberta')
  })

  it('i la casa rural, en marxa des d’ahir, les té totes', () => {
    const casa = {
      ...FESTA,
      tipo: 'casa_rural' as const,
      starts_at: new Date(ARA - 24 * HORA).toISOString(),
    }
    expect(einesDe(casa, ARA)).toContain('escaner')
  })
})

describe('on porta cada eina', () => {
  const id = '00000000-0000-4000-8000-0000000000e1'

  it('a la pantalla de l’esdeveniment, amb el seu id', () => {
    expect(rutaDe('escaner', id)).toBe(`/junta/escaner/${id}`)
    expect(rutaDe('alta', id)).toBe(`/junta/alta/${id}`)
    expect(rutaDe('punts', id)).toBe(`/junta/punts/${id}`)
    expect(rutaDe('pagaments', id)).toBe(`/junta/pagaments/${id}`)
    expect(rutaDe('fitxatges', id)).toBe(`/junta/esdeveniment/${id}/fitxatges`)
    expect(rutaDe('gimcana', id)).toBe(`/junta/esdeveniment/${id}/gimcana`)
    expect(rutaDe('validaGimcana', id)).toBe(`/junta/gimcana/${id}`)
  })
})
