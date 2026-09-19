import { describe, expect, it } from 'vitest'

import { endOfEvent, hasEnded, IN_PROGRESS_MS } from './eventEnd'

/**
 * El cas que paga el fitxer és el tercer: una festa començada fa una hora i
 * sense `ends_at` encara no s'ha acabat.
 *
 * És el que separa aquest tall del que demana de seguida qui ha de treure el
 * futur d'una llista —`starts_at < ara`—, i és la mateixa estona que
 * `InsideScreen` encara pinta amb el punt de «ara mateix» encès.
 */
const COMENCA = '2026-09-18T21:00:00Z'
const T = Date.parse(COMENCA)

describe('quan s’ha acabat una nit', () => {
  it('amb ends_at, s’acaba quan ho diu ends_at', () => {
    const acaba = '2026-09-19T02:00:00Z'
    expect(endOfEvent(COMENCA, acaba)).toBe(Date.parse(acaba))
    expect(hasEnded(COMENCA, acaba, Date.parse(acaba) - 1)).toBe(false)
    expect(hasEnded(COMENCA, acaba, Date.parse(acaba))).toBe(true)
  })

  it('sense ends_at, se’n suposen sis hores', () => {
    expect(endOfEvent(COMENCA, null)).toBe(T + IN_PROGRESS_MS)
    expect(IN_PROGRESS_MS).toBe(6 * 3_600_000)
  })

  it('una festa començada fa una hora encara no s’ha acabat', () => {
    expect(hasEnded(COMENCA, null, T + 3_600_000)).toBe(false)
  })

  it('i set hores després sí', () => {
    expect(hasEnded(COMENCA, null, T + 7 * 3_600_000)).toBe(true)
  })

  it('una nit que encara no ha començat no s’ha acabat', () => {
    expect(hasEnded(COMENCA, null, T - 3 * 24 * 3_600_000)).toBe(false)
  })

  it('un ends_at abans del final suposat mana igualment', () => {
    // Una reunió d'una hora: el tall és el que diu la fila, no les sis hores.
    const acaba = '2026-09-18T22:00:00Z'
    expect(hasEnded(COMENCA, acaba, T + 2 * 3_600_000)).toBe(true)
  })
})
