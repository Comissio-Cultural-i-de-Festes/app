import { describe, expect, it } from 'vitest'

import ca from '@/i18n/locales/ca.json'
import en from '@/i18n/locales/en.json'
import es from '@/i18n/locales/es.json'
import i18n from 'i18next'

import { whenText } from './whenText'

/**
 * Amb les cadenes de debò i no amb una `t` de mentida: el que es vol saber és
 * què llegeix qui obre la fitxa d'una estada de dos dies.
 */
function translator(lng: 'ca' | 'es' | 'en') {
  const inst = i18n.createInstance()
  void inst.init({
    lng,
    resources: { ca: { t: ca }, es: { t: es }, en: { t: en } },
    defaultNS: 't',
    interpolation: { escapeValue: false },
  })
  return inst.t.bind(inst)
}

const MON_22 = new Date('2026-11-23T22:00:00+01:00')

describe('whenText', () => {
  it("diu el dia final quan l'estada acaba dos dies després", () => {
    const end = new Date('2026-11-25T18:00:00+01:00')
    expect(whenText(MON_22, end, 'ca', translator('ca'))).toBe(
      'dilluns, 23 de novembre, a les 22:00 fins al dimecres, 25 de novembre, a les 18:00',
    )
    expect(whenText(MON_22, end, 'es', translator('es'))).toBe(
      'lunes, 23 de noviembre, 22:00 hasta el miércoles, 25 de noviembre, 18:00',
    )
    expect(whenText(MON_22, end, 'en', translator('en'))).toBe(
      'Monday 23 November at 22:00 until Wednesday 25 November at 18:00',
    )
  })

  it("una festa que acaba de matinada només posa l'hora", () => {
    const end = new Date('2026-11-24T03:00:00+01:00')
    expect(whenText(MON_22, end, 'ca', translator('ca'))).toBe(
      'dilluns, 23 de novembre, a les 22:00 fins a les 03:00',
    )
  })

  it("sense final, només l'inici", () => {
    expect(whenText(MON_22, null, 'ca', translator('ca'))).toBe(
      'dilluns, 23 de novembre, a les 22:00',
    )
  })
})
