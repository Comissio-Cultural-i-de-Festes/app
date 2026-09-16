import { describe, expect, it } from 'vitest'

import { SCAN_PRESENTATION } from '@/design/states'

import type { CheckInResult } from './api'
import { verdictText } from './verdict'

/**
 * Les paraules de la targeta del veredicte.
 *
 * El que hi ha en joc és el que es llegeix en mig segon amb una cua al davant.
 * «No ha pagat» sota el nom d'algú que ve a una activitat de franc és una
 * acusació que ningú no pot respondre: no hi havia res a pagar, i qui té el
 * telèfon no té manera de saber-ho des d'aquí.
 */

const PLA = { gone: false, undoNote: null }

function scan(over: Partial<CheckInResult> = {}): CheckInResult {
  return { status: 'ok', nombre: 'Nom', pagado: false, points_awarded: 0, ...over }
}

describe('la línia de detall', () => {
  it('diu que no ha pagat quan l’activitat té preu', () => {
    const w = verdictText(SCAN_PRESENTATION.ok, scan(), { ...PLA, priceCents: 1500 })
    expect(w.detail.map((p) => p.key)).toContain('door.notPaid')
  })

  it('i calla quan és de franc', () => {
    const w = verdictText(SCAN_PRESENTATION.ok, scan(), { ...PLA, priceCents: 0 })
    expect(w.detail.map((p) => p.key)).not.toContain('door.notPaid')
  })

  it('i calla també mentre no se sap el preu, en comptes d’inventar-se un deute', () => {
    const w = verdictText(SCAN_PRESENTATION.ok, scan(), { ...PLA, priceCents: null })
    expect(w.detail.map((p) => p.key)).not.toContain('door.notPaid')
  })

  it('no diu res de diners a qui ja consta com a pagat', () => {
    const w = verdictText(SCAN_PRESENTATION.ok, scan({ pagado: true }), {
      ...PLA,
      priceCents: 1500,
    })
    expect(w.detail.map((p) => p.key)).not.toContain('door.notPaid')
  })

  it('els punts hi surten amb el seu nombre, i només si n’hi ha', () => {
    const amb = verdictText(SCAN_PRESENTATION.ok, scan({ points_awarded: 10 }), {
      ...PLA,
      priceCents: 0,
    })
    expect(amb.detail).toContainEqual({ key: 'units.points', params: { count: 10 } })

    const sense = verdictText(SCAN_PRESENTATION.ok, scan({ points_awarded: 0 }), {
      ...PLA,
      priceCents: 0,
    })
    expect(sense.detail.map((p) => p.key)).not.toContain('units.points')
  })

  it('i l’escola quan es coneix', () => {
    const w = verdictText(SCAN_PRESENTATION.ok, scan({ escola: 'salut' }), {
      ...PLA,
      priceCents: 0,
    })
    expect(w.detail.map((p) => p.key)).toContain('escolaShort.salut')
  })
})

describe('la capçalera de qui es presenta sense estar apuntat', () => {
  const walkin = scan({ status: 'ok_walkin_review' })

  it('parla de pagar quan hi ha preu', () => {
    const w = verdictText(SCAN_PRESENTATION.ok_walkin_review, walkin, {
      ...PLA,
      priceCents: 3000,
    })
    expect(w.headlineKey).toBe('scanner.okWalkinReview')
    expect(w.actionKey).toBe('scanner.action.okWalkinReview')
  })

  it('i parla de places quan és de franc, que és el que el fa saltar', () => {
    const w = verdictText(SCAN_PRESENTATION.ok_walkin_review, walkin, { ...PLA, priceCents: 0 })
    expect(w.headlineKey).toBe('scanner.okWalkinReviewFree')
    expect(w.actionKey).toBe('scanner.action.okWalkinReviewFree')
  })

  it('i no canvia de frase mentre no se sap el preu', () => {
    const w = verdictText(SCAN_PRESENTATION.ok_walkin_review, walkin, { ...PLA, priceCents: null })
    expect(w.headlineKey).toBe('scanner.okWalkinReview')
  })

  it('cap altre estat no té versió gratuïta', () => {
    const w = verdictText(SCAN_PRESENTATION.ok_walkin, scan({ status: 'ok_walkin' }), {
      ...PLA,
      priceCents: 0,
    })
    expect(w.headlineKey).toBe('scanner.okWalkin')
  })
})

describe('quan el fitxatge s’ha desfet', () => {
  it('la targeta deixa de dir que és dins i no queda cap detall al darrere', () => {
    const w = verdictText(SCAN_PRESENTATION.ok, scan({ points_awarded: 10, escola: 'salut' }), {
      gone: true,
      undoNote: 'door.undone',
      priceCents: 1500,
    })
    expect(w.headlineKey).toBe('door.undone')
    expect(w.actionKey).toBeNull()
    expect(w.detail).toEqual([])
  })

  it('i sense nota del desfer es queda la frase de l’estat, sense la línia d’acció', () => {
    const w = verdictText(SCAN_PRESENTATION.ok, scan(), {
      gone: true,
      undoNote: null,
      priceCents: 1500,
    })
    expect(w.headlineKey).toBe('scanner.ok')
    expect(w.actionKey).toBeNull()
  })
})

describe('quan encara no hi ha resposta del servidor', () => {
  it('no hi ha detall, perquè no se sap res de ningú', () => {
    const w = verdictText(SCAN_PRESENTATION.error, null, { ...PLA, priceCents: 1500 })
    expect(w.detail).toEqual([])
    expect(w.headlineKey).toBe('scanner.error')
  })
})
