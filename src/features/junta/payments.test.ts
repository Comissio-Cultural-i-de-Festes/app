import { describe, expect, it } from 'vitest'

import { paidHeader } from './payments'

/**
 * La capçalera de la pantalla de pagaments, segons si hi ha res a cobrar.
 *
 * El que hi ha en joc és una xifra que menteix. `attendances.pagado` arrenca a
 * `false` per a tothom, o sigui que en una activitat de franc «0 de 12
 * apuntats» no vol dir que ningú hagi pagat: vol dir que no hi havia res a
 * pagar. La pantalla ha de fer una altra pregunta, no respondre malament la
 * mateixa.
 */

const rows = [{ pagado: true }, { pagado: false }, { pagado: false }] as const

describe('quan l’activitat té preu', () => {
  it('el número gran és qui ha pagat, sobre el total d’apuntats', () => {
    const cap = paidHeader(1500, rows)
    expect(cap.free).toBe(false)
    expect(cap.n).toBe(1)
    expect(cap.subCount).toBe(3)
  })

  it('i les paraules són les dels diners', () => {
    const cap = paidHeader(1500, rows)
    expect(cap.titleKey).toBe('junta.payments.whoPaid')
    expect(cap.subKey).toBe('junta.payments.ofSignedUp')
    expect(cap.noticeKey).toBe('junta.payments.bizum')
  })
})

describe('quan és de franc', () => {
  it('el número gran compta qui ve, i ningú no hi consta com a pendent', () => {
    const cap = paidHeader(0, rows)
    expect(cap.free).toBe(true)
    expect(cap.n).toBe(3)
    expect(cap.subCount).toBe(3)
  })

  it('i les paraules deixen de parlar de diners', () => {
    const cap = paidHeader(0, rows)
    expect(cap.titleKey).toBe('junta.payments.whoComes')
    expect(cap.subKey).toBe('junta.payments.saidYes')
    expect(cap.noticeKey).toBe('junta.payments.free')
  })

  it('i qui ja constava com a pagat no canvia el recompte', () => {
    // Una activitat pot passar de pagament a gratuïta amb la gent ja marcada.
    // El que s'hagi desat no es perd ni es compta: simplement no es mira.
    expect(paidHeader(0, [{ pagado: true }, { pagado: true }]).n).toBe(2)
  })

  it('sense ningú apuntat, el número és zero i no és un forat', () => {
    expect(paidHeader(0, []).n).toBe(0)
  })
})
