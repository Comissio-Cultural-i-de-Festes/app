import { describe, expect, it } from 'vitest'

import { countdown, countdownLabel, countdownShape } from './countdown'

const NOW = Date.UTC(2026, 10, 22, 18, 0, 0)
const at = (ms: number) => new Date(NOW + ms)

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

describe('el compte enrere de la revelació', () => {
  it('parteix el temps que falta en dies, hores i minuts', () => {
    const c = countdown(at(6 * DAY + 4 * HOUR + 12 * MINUTE), NOW)
    expect(c).toMatchObject({ done: false, days: 6, hours: 4, minutes: 12 })
  })

  it('trunca i no arrodoneix cap amunt', () => {
    // Amb 90 minuts, «1 h» és cert i «2 h» és mentida. Qui obri l'app mitja
    // hora després veuria el mateix número i pensaria que està encallat.
    const c = countdown(at(90 * MINUTE), NOW)
    expect(c.hours).toBe(1)
    expect(c.minutes).toBe(30)
  })

  it('i el que ja ha passat és zero, no un número negatiu', () => {
    // La finestra entre que reveal_at passa i que algú refresca. Comptar cap
    // enrere cap a l'any passat seria pitjor que no comptar.
    const c = countdown(at(-3 * DAY), NOW)
    expect(c).toMatchObject({ done: true, days: 0, hours: 0, minutes: 0, totalMs: 0 })
  })

  it('accepta la cadena que ve de la base tal com arriba', () => {
    const c = countdown(new Date(NOW + 2 * DAY).toISOString(), NOW)
    expect(c.days).toBe(2)
  })
})

describe('la forma curta', () => {
  it('amb dies, diu els dies i les hores', () => {
    expect(countdownShape(countdown(at(6 * DAY + 4 * HOUR), NOW))).toEqual({
      kind: 'days',
      days: 6,
      hours: 4,
    })
  })

  it('amb menys d\'un dia, les hores i els minuts', () => {
    expect(countdownShape(countdown(at(5 * HOUR + 9 * MINUTE), NOW))).toEqual({
      kind: 'hours',
      hours: 5,
      minutes: 9,
    })
  })

  it('amb menys d\'una hora, només els minuts', () => {
    // «0 h 12 m» fa pensar que falta alguna cosa; «12 m» no.
    expect(countdownShape(countdown(at(12 * MINUTE), NOW))).toEqual({
      kind: 'minutes',
      minutes: 12,
    })
  })

  it('i l\'últim minut segueix sent un minut', () => {
    // Un zero que no és `done` es llegeix com una pantalla encallada.
    expect(countdownShape(countdown(at(20_000), NOW))).toEqual({ kind: 'minutes', minutes: 1 })
  })

  it('fins que arriba, i llavors ja no compta', () => {
    expect(countdownShape(countdown(at(0), NOW))).toEqual({ kind: 'now' })
    expect(countdownShape(countdown(at(-1), NOW))).toEqual({ kind: 'now' })
  })
})

describe('la clau que la pantalla tradueix', () => {
  it('porta la forma i els números, i cap text', () => {
    // La lògica no sap res d'i18next: torna la clau i les variables, i qui
    // crida fa `t(key, vars)`. Amb el text ja traduït això no es podria provar
    // sense muntar l'idioma.
    expect(countdownLabel(countdownShape(countdown(at(6 * DAY + 4 * HOUR), NOW)))).toEqual({
      key: 'event.teaser.inDaysHours',
      vars: { days: 6, hours: 4 },
    })
  })

  it('i «count» no hi surt mai', () => {
    // Cap d'aquestes formes es pluralitza. Dir-li `count` faria que i18next
    // busqués `_one`/`_other`, no els trobés, i la línia sortiria en blanc.
    for (const ms of [6 * DAY, 5 * HOUR, 12 * MINUTE, 0]) {
      const label = countdownLabel(countdownShape(countdown(at(ms), NOW)))
      expect(Object.keys(label.vars)).not.toContain('count')
    }
  })
})
