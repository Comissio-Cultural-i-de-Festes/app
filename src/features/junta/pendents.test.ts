import { describe, expect, it } from 'vitest'

import { type CampsPendent, demanenFeina, estatDelPendent, llegeixPendent } from './pendents'

/**
 * Un avís pendent abans d'enviar-lo, i el seu estat a la llista.
 *
 * Els telèfons són inventats i comencen per 9: no són mòbils de ningú.
 * `avui` es passa escrit, perquè la prova no depengui del dia en què es corre.
 */

const AVUI = '2026-10-20'

const camps = (over: Partial<CampsPendent> = {}): CampsPendent => ({
  nom: 'Persona Inventada',
  telefon: '912 34 56 78',
  dia: '2026-10-14',
  tipus: 'no_va_venir',
  punts: '-10',
  nota: 'No va venir al muntatge',
  mesura: '',
  ...over,
})

describe('llegir un avís pendent', () => {
  it('accepta el cas normal, amb la mesura en blanc com a null', () => {
    expect(llegeixPendent(camps(), AVUI)).toEqual({
      nom: 'Persona Inventada',
      telefon: '912 34 56 78',
      dia: '2026-10-14',
      tipus: 'no_va_venir',
      punts: -10,
      nota: 'No va venir al muntatge',
      mesura: null,
    })
  })

  it('un camp en blanc no és un error, només no deixa enviar', () => {
    expect(llegeixPendent(camps({ nom: '  ' }), AVUI)).toBeNull()
    expect(llegeixPendent(camps({ telefon: '' }), AVUI)).toBeNull()
    expect(llegeixPendent(camps({ dia: '' }), AVUI)).toBeNull()
    expect(llegeixPendent(camps({ tipus: '' }), AVUI)).toBeNull()
  })

  it('refusa un telèfon que l’onboarding tampoc no acceptaria', () => {
    expect(llegeixPendent(camps({ telefon: '1234' }), AVUI)).toBe('telefon')
    expect(llegeixPendent(camps({ telefon: '+34 912 34 56 78' }), AVUI)).not.toBe('telefon')
  })

  it('refusa una falta futura, i avui sí que val', () => {
    expect(llegeixPendent(camps({ dia: '2026-10-21' }), AVUI)).toBe('dia')
    expect(llegeixPendent(camps({ dia: AVUI }), AVUI)).not.toBe('dia')
  })

  it('refusa un nom massa llarg', () => {
    expect(llegeixPendent(camps({ nom: 'a'.repeat(81) }), AVUI)).toBe('nom')
  })

  it('i les regles de l’avís són les de `llegeixAvis`', () => {
    expect(llegeixPendent(camps({ punts: '5' }), AVUI)).toBe('punts')
    expect(llegeixPendent(camps({ nota: '  ' }), AVUI)).toBe('nota')
  })

  it('els punts en blanc no deixen enviar: no hi ha cap zero per defecte', () => {
    expect(llegeixPendent(camps({ punts: '', nota: 'Una nota' }), AVUI)).toBe('punts')
  })

  it('i una mesura massa llarga es diu', () => {
    expect(llegeixPendent(camps({ mesura: 'a'.repeat(501) }), AVUI)).toBe('mesura')
  })
})

describe('l’estat d’un pendent', () => {
  const buit = { enllacat_at: null, retirat_at: null, motiu: null }

  it('sense cap motiu, espera', () => {
    expect(estatDelPendent(buit)).toBe('sense_enllacar')
  })

  it('amb més d’un soci amb el telèfon, ambigu', () => {
    expect(estatDelPendent({ ...buit, motiu: 'ambigu' })).toBe('ambigu')
  })

  it('amb qualsevol altre motiu, bloquejat', () => {
    expect(estatDelPendent({ ...buit, motiu: 'avis_sostre' })).toBe('bloquejat')
    expect(estatDelPendent({ ...buit, motiu: 'error' })).toBe('bloquejat')
  })

  it('resolt mana sobre el motiu', () => {
    const t = '2026-10-20T10:00:00Z'
    expect(estatDelPendent({ ...buit, motiu: 'ambigu', enllacat_at: t })).toBe('enllacat')
    expect(estatDelPendent({ ...buit, motiu: 'ambigu', retirat_at: t })).toBe('retirat')
  })

  it('només l’ambigu i el bloquejat demanen feina a la junta', () => {
    expect(demanenFeina('ambigu')).toBe(true)
    expect(demanenFeina('bloquejat')).toBe(true)
    expect(demanenFeina('sense_enllacar')).toBe(false)
    expect(demanenFeina('enllacat')).toBe(false)
  })
})
