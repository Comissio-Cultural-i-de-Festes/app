import { createInstance } from 'i18next'
import { describe, expect, it } from 'vitest'

import ca from '../src/i18n/locales/ca.json'
import en from '../src/i18n/locales/en.json'
import es from '../src/i18n/locales/es.json'

/**
 * El zero té text propi, i el text propi es fa servir.
 *
 * `_zero` no és una categoria del CLDR per al català, el castellà ni l'anglès:
 * cap dels tres té regla per al zero, i el que li tocaria és `_other`. Però
 * i18next el tracta a part —amb `count === 0` i sense ordinal, prova `key_zero`
 * **abans** que `_other`— i això és una decisió de la llibreria, no de la
 * llengua. El dia que canviï, «Ningú marcat encara» es convertirà en «0
 * persones marcades» sense que res falli i sense que ningú ho miri.
 *
 * Passa a la pantalla de repartir punts: en obrir-la ningú està marcat, o sigui
 * que `count` val 0 en l'estat d'arribada, no en un cas de vora.
 *
 * La parella d'aquest fitxer és `i18n-parity.test.ts`, que comprova que les
 * tres llengües diguin les mateixes claus. Aquest comprova que la clau que hi
 * ha sigui la que surt.
 */

/**
 * El català com a forma de les tres.
 *
 * `i18n-parity.test.ts` ja imposa que els tres fitxers portin les mateixes
 * claus, així que fer servir un d'ells com a tipus no amaga res: si es
 * desviessin, aquell test cau abans que aquest.
 */
type Tree = typeof ca

const LOCALES: { readonly code: string; readonly tree: Tree }[] = [
  { code: 'ca', tree: ca },
  { code: 'es', tree: es },
  { code: 'en', tree: en },
]

/** El mateix que munta l'app, sense detector ni React. */
function make(code: string, tree: Tree) {
  const i18n = createInstance()
  void i18n.init({
    lng: code,
    resources: { [code]: { translation: tree } },
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
  })
  return i18n
}

describe('el zero de «ningú marcat»', () => {
  for (const { code, tree } of LOCALES) {
    it(`es resol a chosen_zero en ${code}`, () => {
      const i18n = make(code, tree)
      const zero = i18n.t('door.chosen', { count: 0 })
      const other = i18n.t('door.chosen', { count: 5 })

      // No «conté el 0»: el que ha de passar és que no surti cap número.
      expect(zero).not.toContain('0')
      // I que no sigui la forma del plural amb el número canviat, que és on
      // aniria a parar si la clau desapareix.
      expect(zero).not.toBe(other.replace('5', '0'))
    })

    it(`i el text és exactament el que hi ha escrit a ${code}.json`, () => {
      // Sense això, esborrar `chosen_zero` deixaria passar la prova de sobre
      // el dia que `chosen_other` no porti el número.
      const written = tree.door.chosen_zero
      expect(written, "la clau ha d'existir").toBeTypeOf('string')
      expect(make(code, tree).t('door.chosen', { count: 0 })).toBe(written)
    })
  }

  it("i l'un i el molts segueixen sent l'un i el molts", () => {
    // Perquè la prova de sobre passaria igual amb les tres formes iguals.
    const i18n = make('ca', ca)
    expect(i18n.t('door.chosen', { count: 1 })).toContain('1')
    expect(i18n.t('door.chosen', { count: 7 })).toContain('7')
    expect(i18n.t('door.chosen', { count: 1 })).not.toBe(i18n.t('door.chosen', { count: 7 }))
  })
})
