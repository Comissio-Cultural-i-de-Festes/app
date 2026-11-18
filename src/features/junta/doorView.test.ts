import { describe, expect, it } from 'vitest'

import { type DoorEvent, type HomeQuery, aLaPorta, doorView, minutesAgo } from './doorView'
import type { DoorNow, JuntaHomeData } from './homeApi'

/**
 * Què pinta la porta del rebedor segons el que sap la consulta.
 *
 * El cas que va obrir la issue #30: tornar a l'app amb la xarxa saturada, la
 * recàrrega falla i la porta que ja hi era desapareix darrere d'un error. Les
 * dades d'abans valen més que cap error, i aquí es fixa l'ordre.
 */

const ARA = Date.parse('2026-11-27T21:00:00Z')
const MIN = 60_000
const HORA = 60 * MIN

const porta: DoorNow = {
  id: '00000000-0000-4000-8000-0000000000e1',
  titulo: 'Esdeveniment Inventat',
  starts_at: '2026-11-27T20:00:00Z',
  ubicacion: null,
  plazas: null,
  diuen_si: 12,
  fitxats: 3,
  esperen: 0,
  no_pagats: 0,
  gimcana_cua: null,
}

const dades = (p: DoorNow | null = porta): JuntaHomeData => ({
  porta: p,
  pendents: 0,
  esborranys: 0,
  propers: 1,
  socis: 40,
})

const consulta = (over: Partial<HomeQuery> = {}): HomeQuery => ({
  data: dades(),
  isError: false,
  fetchStatus: 'idle',
  dataUpdatedAt: ARA - 5 * MIN,
  ...over,
})

const ev = (
  id: string,
  startsAt: number,
  published = true,
  endsAt: number | null = null,
): DoorEvent => ({
  id,
  starts_at: new Date(startsAt).toISOString(),
  ends_at: endsAt === null ? null : new Date(endsAt).toISOString(),
  published,
})

describe('la porta amb dades', () => {
  it('es pinta neta quan la consulta ha anat bé', () => {
    expect(doorView(consulta(), undefined, ARA)).toEqual({
      kind: 'door',
      porta,
      portes: [porta],
      stale: null,
    })
  })

  it('es pinta igual quan la recàrrega falla, amb l’hora de les dades', () => {
    expect(doorView(consulta({ isError: true }), undefined, ARA)).toEqual({
      kind: 'door',
      porta,
      portes: [porta],
      stale: { since: ARA - 5 * MIN, failed: true },
    })
  })

  it('també és vella mentre la recàrrega espera que torni la xarxa', () => {
    expect(doorView(consulta({ fetchStatus: 'paused' }), undefined, ARA)).toMatchObject({
      kind: 'door',
      stale: { since: ARA - 5 * MIN, failed: true },
    })
  })

  it('no és vella mentre recarrega unes dades de fa menys d’un minut', () => {
    const fresques = consulta({ fetchStatus: 'fetching', dataUpdatedAt: ARA - 30_000 })
    expect(doorView(fresques, undefined, ARA)).toMatchObject({ stale: null })
  })

  it('sí que ho és si recarrega unes dades velles: la recàrrega pot estar penjada', () => {
    // Una recàrrega penjada no falla mai, i sense això la porta ensenyava
    // números de fa quaranta minuts com si fossin d’ara.
    expect(doorView(consulta({ fetchStatus: 'fetching' }), undefined, ARA)).toMatchObject({
      stale: { since: ARA - 5 * MIN, failed: false },
    })
  })

  it('diu «res aquests dies» amb les dades velles si és el que deien', () => {
    expect(doorView(consulta({ data: dades(null), isError: true }), undefined, ARA)).toEqual({
      kind: 'none',
      stale: { since: ARA - 5 * MIN, failed: true },
    })
  })
})

describe('la porta sense dades', () => {
  const sense = { data: undefined, dataUpdatedAt: 0 }

  it('carrega mentre la primera consulta és en marxa', () => {
    expect(doorView(consulta({ ...sense, fetchStatus: 'fetching' }), undefined, ARA)).toEqual({
      kind: 'loading',
      scannerEventId: null,
    })
  })

  it('i ja ofereix l’escàner mentre carrega si la llista d’esdeveniments el sap', () => {
    // En fred amb la xarxa saturada, la primera consulta pot trigar minuts.
    const llista = [ev('aquest', ARA - HORA)]
    expect(doorView(consulta({ ...sense, fetchStatus: 'fetching' }), llista, ARA)).toEqual({
      kind: 'loading',
      scannerEventId: 'aquest',
    })
  })

  it('falla sense cap camí a l’escàner si no se sap de quin esdeveniment', () => {
    expect(doorView(consulta({ ...sense, isError: true }), undefined, ARA)).toEqual({
      kind: 'failed',
      scannerEventId: null,
    })
  })

  it('falla també sense xarxa, en lloc de carregar per sempre', () => {
    expect(doorView(consulta({ ...sense, fetchStatus: 'paused' }), undefined, ARA)).toMatchObject({
      kind: 'failed',
    })
  })

  it('treu l’escàner de la llista d’esdeveniments, amb la finestra de junta_home()', () => {
    const llista = [
      ev('massa-vell', ARA - 9 * HORA),
      ev('esborrany', ARA - HORA, false),
      ev('aquest', ARA - 2 * HORA),
      ev('dema', ARA + 20 * HORA),
    ]
    expect(doorView(consulta({ ...sense, isError: true }), llista, ARA)).toEqual({
      kind: 'failed',
      scannerEventId: 'aquest',
    })
  })

  it('no en treu cap si el primer és d’aquí a més de trenta hores', () => {
    const llista = [ev('massa-lluny', ARA + 31 * HORA)]
    expect(doorView(consulta({ ...sense, isError: true }), llista, ARA)).toMatchObject({
      scannerEventId: null,
    })
  })
})

describe('més d’una porta (migració 89)', () => {
  const casa: DoorNow = { ...porta, id: 'casa', starts_at: '2026-11-26T16:00:00Z' }
  const festa: DoorNow = { ...porta, id: 'festa' }
  const dues = consulta({ data: { ...dades(casa), portes: [casa, festa] } })

  it('pinta la primera si no se n’ha triat cap, com abans', () => {
    expect(doorView(dues, undefined, ARA)).toMatchObject({ porta: casa, portes: [casa, festa] })
  })

  it('i la triada si n’hi ha una', () => {
    expect(doorView(dues, undefined, ARA, 'festa')).toMatchObject({ porta: festa })
  })

  it('sense dades, l’escàner de la llista és també el de la triada', () => {
    const llista = [ev('casa', ARA - 29 * HORA, true, ARA + 40 * HORA), ev('festa', ARA - HORA)]
    const sense = consulta({ data: undefined, dataUpdatedAt: 0, isError: true })
    expect(doorView(sense, llista, ARA, 'festa')).toMatchObject({ scannerEventId: 'festa' })
    expect(doorView(sense, llista, ARA, null)).toMatchObject({ scannerEventId: 'casa' })
  })
})

describe('la finestra de la porta, la de junta_home()', () => {
  it('té la casa rural tota l’estada, encara que comencés fa dos dies', () => {
    expect(aLaPorta(ev('casa', ARA - 48 * HORA, true, ARA + HORA), ARA)).toBe(true)
  })

  it('i la treu quan s’ha acabat', () => {
    expect(aLaPorta(ev('casa', ARA - 48 * HORA, true, ARA - HORA), ARA)).toBe(false)
  })

  it('una festa d’una nit hi és vuit hores des de l’inici, encara que ja hagi acabat', () => {
    expect(aLaPorta(ev('festa', ARA - 7 * HORA, true, ARA - 3 * HORA), ARA)).toBe(true)
    expect(aLaPorta(ev('festa', ARA - 9 * HORA, true, ARA - 3 * HORA), ARA)).toBe(false)
  })

  it('i sense final, la regla de sempre', () => {
    expect(aLaPorta(ev('festa', ARA - 7 * HORA), ARA)).toBe(true)
    expect(aLaPorta(ev('festa', ARA - 9 * HORA), ARA)).toBe(false)
  })

  it('i un esborrany mai', () => {
    expect(aLaPorta(ev('esborrany', ARA - HORA, false, ARA + HORA), ARA)).toBe(false)
  })
})

describe('quants minuts fa', () => {
  it('arrodoneix avall i no baixa de zero', () => {
    expect(minutesAgo(ARA - 30_000, ARA)).toBe(0)
    expect(minutesAgo(ARA - 3 * MIN - 59_000, ARA)).toBe(3)
    expect(minutesAgo(ARA + MIN, ARA)).toBe(0)
  })
})
