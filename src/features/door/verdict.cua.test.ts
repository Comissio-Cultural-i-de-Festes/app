import { describe, expect, it } from 'vitest'

import { type DoorOutcome, presentationOf } from './api'
import { verdictText } from './verdict'

/**
 * EL FORAT DE LA CUA, a una activitat de franc.
 *
 * AQUESTA PROVA ÉS VERMELLA A POSTA. No arregla res: demostra el cas que la
 * issue #9 diu que no ha de passar i que cap prova ni cap captura no toca.
 *
 * Un escaneig que s'encua —sense cobertura— no té `result`, i `verdictText`
 * només aplica `FREE_COPY` quan n'hi ha. La presentació d'un encuat la manlleva
 * `presentationOf` de `ok_walkin_review` sencera, `actionKey` inclosa, i
 * aquella clau parla de diners: «Mira que pagui abans d'entrar, o apunta-ho.»
 *
 * O sigui que a la porta d'una activitat sense preu, amb el preu ja carregat i
 * valent zero, la targeta acaba dient que algú ha de pagar. És exactament la
 * frase que la issue treu de `scanner.okWalkinReview`, per l'altra porta.
 *
 * Vist al navegador el 18 de setembre de 2026 a l'Esdeveniment Alfa
 * (`precio_cents = 0`), amb la pestanya en mode avió:
 *
 *   AQUEST QR / Desat. S'enviarà quan hi hagi cobertura /
 *   Mira que pagui abans d'entrar, o apunta-ho.
 *
 * On aniria l'arreglament: a `verdict.ts`, fent que la tria de `FREE_COPY` no
 * depengui de tenir `result` —l'estat que es dibuixa ja el dona `shown`— o bé
 * a `presentationOf`, que no hauria de manllevar la línia d'acció d'un estat
 * que parla de pagar per dibuixar-ne un altre que no en parla.
 */

const PLA = { gone: false, undoNote: null }

const encuat: DoorOutcome = {
  kind: 'queued',
  request: {
    clientRequestId: '00000000-0000-4000-8000-0000000000cc',
    eventId: '00000000-0000-4000-8000-0000000000e1',
    qrToken: 'inventat',
    userId: null,
  },
}

describe('un escaneig encuat a una activitat de franc', () => {
  it('diu que s’ha desat, que és l’única cosa que se sap', () => {
    const w = verdictText(presentationOf(encuat), null, { ...PLA, priceCents: 0 })
    expect(w.headlineKey).toBe('scanner.queued')
    expect(w.detail).toEqual([])
  })

  it('i no demana que ningú pagui, perquè no hi ha res a pagar', () => {
    const w = verdictText(presentationOf(encuat), null, { ...PLA, priceCents: 0 })
    expect(w.actionKey).not.toBe('scanner.action.okWalkinReview')
  })
})
