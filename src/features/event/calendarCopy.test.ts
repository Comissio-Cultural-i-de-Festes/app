import { describe, expect, it } from 'vitest'

import ca from '@/i18n/locales/ca.json'
import en from '@/i18n/locales/en.json'
import es from '@/i18n/locales/es.json'

/**
 * El calendari és un fitxer .ics que es baixa: no hi ha cap subscripció, i
 * un fitxer ja importat no es mou sol quan canvia l'hora. Cap text pot
 * prometre-ho ni afirmar que l'esdeveniment ja és al calendari, perquè l'app
 * només sap que s'ha baixat el fitxer, no que s'hagi obert.
 */

const AUTO_UPDATE = /s'actualitza|se actualiza|\bit updates\b/i
const UNTESTED_PROMISE = /duplic|posa al dia|pone al d[ií]a|brought up to date/i
const CLAIMS_IT_IS_THERE = /és al teu calendari|está en tu calendario|is in your calendar/i

const locales = { ca, es, en } as const

describe.each(Object.entries(locales))('calendar copy (%s)', (_name, locale) => {
  const c = locale.event.calendar

  it('does not promise that a downloaded file updates itself', () => {
    for (const text of [c.offerTitle, c.offerBody, c.cannotRead]) {
      expect(text).not.toMatch(AUTO_UPDATE)
    }
  })

  it('does not promise what re-opening the file does to the entry', () => {
    for (const text of [c.offerBody, c.cannotRead]) {
      expect(text).not.toMatch(UNTESTED_PROMISE)
    }
  })

  it('does not claim the event is in the calendar', () => {
    for (const text of [c.offerBody, c.isThere, c.cannotRead]) {
      expect(text).not.toMatch(CLAIMS_IT_IS_THERE)
    }
  })
})
