import { describe, expect, it } from 'vitest'

import type { DoorNow, JuntaHomeData } from './homeApi'
import { portaTriada, portesDe } from './portes'

/**
 * Quina porta pinta el rebedor quan n'hi ha més d'una (migració 89).
 *
 * El cas de l'issue #28: la casa rural en marxa i una festa a la ciutat la
 * mateixa nit. La junta tria a quina fa porta, i amb una sola el rebedor es
 * comporta com abans: ni selector ni res a triar.
 */

const porta = (id: string, startsAt: string): DoorNow => ({
  id,
  titulo: `Esdeveniment ${id}`,
  starts_at: startsAt,
  ends_at: null,
  ubicacion: null,
  plazas: null,
  diuen_si: 0,
  fitxats: 0,
  esperen: 0,
  no_pagats: 0,
  gimcana_cua: null,
})

const CASA = porta('casa', '2026-11-27T16:00:00Z')
const FESTA = porta('festa', '2026-11-28T21:00:00Z')

const dades = (over: Partial<JuntaHomeData>): JuntaHomeData => ({
  porta: null,
  pendents: 0,
  esborranys: 0,
  propers: 0,
  socis: 0,
  ...over,
})

describe('les portes de la resposta', () => {
  it('són `portes` quan la base les porta', () => {
    expect(portesDe(dades({ porta: CASA, portes: [CASA, FESTA] }))).toEqual([CASA, FESTA])
  })

  it('i, contra una base d’abans de la 89, la porta sola', () => {
    expect(portesDe(dades({ porta: CASA }))).toEqual([CASA])
  })

  it('i cap quan no n’hi ha cap', () => {
    expect(portesDe(dades({}))).toEqual([])
  })
})

describe('la porta triada', () => {
  it('és la que la junta ha triat, si encara hi és', () => {
    expect(portaTriada([CASA, FESTA], 'festa')).toBe(FESTA)
  })

  it('és la primera si no n’ha triat cap, que és el que feia abans', () => {
    expect(portaTriada([CASA, FESTA], null)).toBe(CASA)
  })

  it('i és la primera si la triada ja no és a la finestra', () => {
    expect(portaTriada([FESTA], 'casa')).toBe(FESTA)
  })

  it('i no n’hi ha cap si no hi ha portes', () => {
    expect(portaTriada([], 'casa')).toBeNull()
  })
})
