import { describe, expect, it } from 'vitest'

import { eventPhase } from './phase'

/**
 * El cas que paga el fitxer és el de dissabte al migdia: la casa rural va
 * començar divendres i s'acaba diumenge, i la fitxa deia «Ja ha passat» a
 * tothom que hi era dins.
 */
const DIVENDRES = '2026-11-27T16:00:00Z'
const DIUMENGE = '2026-11-29T15:00:00Z'
const HORA = 3_600_000

describe('en quin moment és una activitat', () => {
  it('abans de començar, encara ha de venir', () => {
    expect(eventPhase(DIVENDRES, DIUMENGE, Date.parse(DIVENDRES) - 1)).toBe('upcoming')
  })

  it('al mil·lisegon de començar ja és en curs', () => {
    expect(eventPhase(DIVENDRES, DIUMENGE, Date.parse(DIVENDRES))).toBe('live')
  })

  it('dissabte al migdia, una estada de tres dies és en curs i no passada', () => {
    expect(eventPhase(DIVENDRES, DIUMENGE, Date.parse('2026-11-28T12:00:00Z'))).toBe('live')
  })

  it('al mil·lisegon del final ja s’ha acabat', () => {
    expect(eventPhase(DIVENDRES, DIUMENGE, Date.parse(DIUMENGE) - 1)).toBe('live')
    expect(eventPhase(DIVENDRES, DIUMENGE, Date.parse(DIUMENGE))).toBe('over')
  })

  it('sense ends_at, en curs les sis hores que suposa la resta de l’app', () => {
    const t = Date.parse(DIVENDRES)
    expect(eventPhase(DIVENDRES, null, t + 5 * HORA)).toBe('live')
    expect(eventPhase(DIVENDRES, null, t + 7 * HORA)).toBe('over')
  })
})
