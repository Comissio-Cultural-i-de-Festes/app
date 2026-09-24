import { describe, expect, it } from 'vitest'

import type { AvisPeriode } from './avisosApi'
import { compta } from './avisosCompte'
import {
  clauEstat,
  clauQueFerEstat,
  escaloNou,
  estatDe,
  llegeixNormativa,
  pesDe,
  quantsPerEstat,
} from './estatAvisos'

/**
 * La normativa: pesos, escalons, i qui és a cada escaló.
 *
 * ELS CASOS DEL MIG SÓN ELS QUE LA JUNTA VA ESCRIURE, amb els valors de fàbrica
 * de la migració 84: una lleu i una greu fan avís, una lleu més fa risc, una
 * sola molt greu ja fa risc, i dues molt greus fan expulsió a votació. Es
 * passen per `compta()` i no per un pes escrit a mà, perquè el que ha de quadrar
 * és la cadena sencera: la fila de la base, el seu pes, la suma i l'escaló.
 *
 * Les dates van escrites senceres i lluny de `now()`, pel mateix motiu que a
 * `avisosCompte.test.ts`.
 */

const CURS_DES_DE = '2026-09-01T00:00:00+00:00'
const CURS_FINS_A = '2027-08-01T00:00:00+00:00'

const FABRICA = llegeixNormativa([
  { mena: 'avisos', clau: 'pes_lleu', punts: 1 },
  { mena: 'avisos', clau: 'pes_greu', punts: 2 },
  { mena: 'avisos', clau: 'pes_molt_greu', punts: 4 },
  { mena: 'avisos', clau: 'llindar_avis', punts: 2 },
  { mena: 'avisos', clau: 'llindar_risc', punts: 4 },
  { mena: 'avisos', clau: 'llindar_expulsio', punts: 6 },
  { mena: 'avisos', clau: 'sostre_curs', punts: 200 },
  // Una fila d'una altra mena amb una clau que s'hi assembla no hi ha d'entrar.
  { mena: 'motiu', clau: 'pes_lleu', punts: 99 },
])

const fila = (over: Partial<AvisPeriode> = {}): AvisPeriode => ({
  user_id: 'alfa',
  gravetat: 1,
  created_at: '2026-10-14T20:00:00+00:00',
  retirat_at: null,
  ...over,
})

const estatDeFiles = (files: readonly AvisPeriode[], normativa = FABRICA) =>
  estatDe(compta(files, CURS_DES_DE, CURS_FINS_A, normativa.pesos).get('alfa'), normativa.llindars)

describe('llegir la normativa', () => {
  it('pren les sis files de la mena `avisos` i cap altra', () => {
    expect(FABRICA).toEqual({
      pesos: { 1: 1, 2: 2, 3: 4 },
      llindars: { avis: 2, risc: 4, expulsio: 6 },
    })
  })

  it('una fila que falta val zero, que vol dir apagat, i no un valor inventat', () => {
    expect(llegeixNormativa(undefined)).toEqual({
      pesos: { 1: 0, 2: 0, 3: 0 },
      llindars: { avis: 0, risc: 0, expulsio: 0 },
    })
  })

  it('una gravetat fora de l’1-3 no pesa', () => {
    expect(pesDe(3, FABRICA.pesos)).toBe(4)
    expect(pesDe(4, FABRICA.pesos)).toBe(0)
    expect(pesDe(0, FABRICA.pesos)).toBe(0)
  })
})

describe('els escalons de la normativa acordada', () => {
  it('sense avisos vius, ok', () => {
    expect(estatDe(undefined, FABRICA.llindars)).toBe('ok')
    expect(estatDeFiles([])).toBe('ok')
  })

  it('una lleu sola pesa 1 i no arriba a l’avís', () => {
    expect(estatDeFiles([fila()])).toBe('ok')
  })

  it('lleu + greu = 3: avís', () => {
    expect(estatDeFiles([fila(), fila({ gravetat: 2 })])).toBe('avis')
  })

  it('una lleu més = 4: risc', () => {
    expect(estatDeFiles([fila(), fila({ gravetat: 2 }), fila()])).toBe('risc')
  })

  it('una sola molt greu = 4: risc', () => {
    expect(estatDeFiles([fila({ gravetat: 3 })])).toBe('risc')
  })

  it('dues molt greus = 8: expulsió a votació', () => {
    expect(estatDeFiles([fila({ gravetat: 3 }), fila({ gravetat: 3 })])).toBe('expulsio')
  })

  it('retirar-ne una fa baixar l’estat', () => {
    const retirada = fila({ gravetat: 3, retirat_at: '2026-10-20T10:00:00+00:00' })
    expect(estatDeFiles([fila({ gravetat: 3 }), retirada])).toBe('risc')
  })
})

describe('els límits', () => {
  it('s’hi arriba en tocar l’escaló, no en superar-lo', () => {
    // «Avís 2» vol dir que amb dos ja hi és. Amb `>` la junta que hi escrivís 2
    // en descobriria el sentit el dia que algú arribés a 3.
    expect(estatDe({ pes: 1 }, FABRICA.llindars)).toBe('ok')
    expect(estatDe({ pes: 2 }, FABRICA.llindars)).toBe('avis')
    expect(estatDe({ pes: 3 }, FABRICA.llindars)).toBe('avis')
    expect(estatDe({ pes: 4 }, FABRICA.llindars)).toBe('risc')
    expect(estatDe({ pes: 5 }, FABRICA.llindars)).toBe('risc')
    expect(estatDe({ pes: 6 }, FABRICA.llindars)).toBe('expulsio')
  })

  it('el que és d’abans del curs no compta', () => {
    const vell = fila({ gravetat: 3, created_at: '2026-06-30T20:00:00+00:00' })
    expect(estatDeFiles([vell, vell])).toBe('ok')
  })

  it('i el primer instant del curs que ve tampoc, amb el final exclusiu', () => {
    const vinent = fila({ gravetat: 3, created_at: CURS_FINS_A })
    expect(estatDeFiles([vinent, vinent])).toBe('ok')
    const primer = fila({ gravetat: 3, created_at: CURS_DES_DE })
    expect(estatDeFiles([primer, primer])).toBe('expulsio')
  })
})

describe('un escaló a zero s’apaga', () => {
  it('amb l’expulsió apagada, el pes que hi arribava es queda a risc', () => {
    const sense = { ...FABRICA.llindars, expulsio: 0 }
    expect(estatDe({ pes: 8 }, sense)).toBe('risc')
  })

  it('amb el del mig apagat, se salta', () => {
    const sense = { ...FABRICA.llindars, risc: 0 }
    expect(estatDe({ pes: 4 }, sense)).toBe('avis')
    expect(estatDe({ pes: 6 }, sense)).toBe('expulsio')
  })

  it('amb tots tres apagats, ningú no surt marcat', () => {
    expect(estatDe({ pes: 99 }, { avis: 0, risc: 0, expulsio: 0 })).toBe('ok')
  })

  it('un pes a zero vol dir que aquella gravetat no suma', () => {
    const normativa = { ...FABRICA, pesos: { ...FABRICA.pesos, 1: 0 } }
    expect(estatDeFiles([fila(), fila(), fila(), fila()], normativa)).toBe('ok')
  })

  it('i uns escalons desordenats es llegeixen igual, de dalt a baix', () => {
    // La 84 no posa cap CHECK `risc > avis`. Si la junta escriu el risc per
    // sota de l'avís, mana el més alt que s'ha assolit.
    const desordenats = { avis: 5, risc: 3, expulsio: 9 }
    expect(estatDe({ pes: 3 }, desordenats)).toBe('risc')
    expect(estatDe({ pes: 5 }, desordenats)).toBe('risc')
  })
})

describe('el rebedor', () => {
  it('compta quanta gent hi ha a cada escaló per sobre d’ok', () => {
    const comptes = new Map([
      ['alfa', { pes: 1 }],
      ['bravo', { pes: 3 }],
      ['charlie', { pes: 4 }],
      ['delta', { pes: 8 }],
      ['echo', { pes: 6 }],
    ])
    expect(quantsPerEstat(comptes, FABRICA.llindars)).toEqual({ avis: 1, risc: 1, expulsio: 2 })
  })
})

describe('com es diu cada estat', () => {
  it('cada estat té nom, i només els escalons tenen «què fer»', () => {
    expect(clauEstat('expulsio')).toBe('avisos.estat.expulsio')
    expect(clauQueFerEstat('risc')).toBe('avisos.queFer.estat.risc')
    expect(clauQueFerEstat('ok')).toBeNull()
  })
})

describe('l’escaló on quedaria algú amb un avís més', () => {
  it('ho diu quan en canvia', () => {
    expect(escaloNou(3, 1, FABRICA)).toBe('risc')
    expect(escaloNou(0, 3, FABRICA)).toBe('risc')
    expect(escaloNou(4, 3, FABRICA)).toBe('expulsio')
  })

  it('i calla quan es queda on és', () => {
    expect(escaloNou(0, 1, FABRICA)).toBeNull()
    expect(escaloNou(2, 1, FABRICA)).toBeNull()
    expect(escaloNou(8, 3, FABRICA)).toBeNull()
  })

  it('amb els escalons apagats no n’hi ha cap de nou', () => {
    const apagats = { ...FABRICA, llindars: { avis: 0, risc: 0, expulsio: 0 } }
    expect(escaloNou(5, 3, apagats)).toBeNull()
  })
})
