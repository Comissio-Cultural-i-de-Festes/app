import { describe, expect, it } from 'vitest'

import type { AvisPeriode } from './avisosApi'
import { compta as comptaAmb, dinsDelCurs } from './avisosCompte'

/**
 * El comptador dels avisos vius del curs, i el que pesen.
 *
 * Tres coses es fixen aquí i cap no es veu obrint una pantalla amb la base tal
 * com està: que el retirat no compti, que la finestra del curs talli pels dos
 * costats amb el final exclusiu, i que una finestra oberta no vulgui dir
 * «ningú».
 *
 * Les dates van escrites senceres i lluny de `now()`: un comptador que depengui
 * del mes en què algú corri la prova és el defecte que aquesta prova busca.
 */

const CURS_DES_DE = '2026-09-01T00:00:00+00:00'
const CURS_FINS_A = '2027-08-01T00:00:00+00:00'

// Els pesos de fàbrica (migració 84). Qui llegeix l'escaló que en surt és
// `estatAvisos.test.ts`; aquí només es fixa què se suma i què no.
const PESOS = { 1: 1, 2: 2, 3: 4 } as const

const compta = (files: readonly AvisPeriode[], des_de: string | null, fins_a: string | null) =>
  comptaAmb(files, des_de, fins_a, PESOS)

const fila = (over: Partial<AvisPeriode> = {}): AvisPeriode => ({
  user_id: 'alfa',
  gravetat: 1,
  created_at: '2026-10-14T20:00:00+00:00',
  retirat_at: null,
  ...over,
})

describe('comptar els avisos del curs', () => {
  it('suma els vius d’una persona, pel seu pes', () => {
    const out = compta(
      [fila(), fila({ gravetat: 2, created_at: '2026-11-02T20:00:00+00:00' })],
      CURS_DES_DE,
      CURS_FINS_A,
    )
    expect(out.get('alfa')).toEqual({ quants: 2, pes: 3 })
  })

  it('i els separa per persona', () => {
    const out = compta([fila(), fila({ user_id: 'bravo', gravetat: 3 })], CURS_DES_DE, CURS_FINS_A)
    expect(out.get('alfa')).toEqual({ quants: 1, pes: 1 })
    expect(out.get('bravo')).toEqual({ quants: 1, pes: 4 })
  })

  it('no compta el retirat', () => {
    // LA DECISIÓ DE FONS. Si la junta diu que allò no va passar, el comptador ho
    // ha de saber; si no, retirar un avís només tornaria els punts i la meitat
    // que marca la fitxa es quedaria igual.
    const out = compta(
      [fila({ gravetat: 3, retirat_at: '2026-10-20T10:00:00+00:00' })],
      CURS_DES_DE,
      CURS_FINS_A,
    )
    expect(out.get('alfa')).toBeUndefined()
  })

  it('i deixa la persona fora del mapa quan tots els seus són retirats', () => {
    // Important per a la pantalla: `undefined` vol dir «no pintis res», que és
    // diferent de pintar «0 avisos» sota el nom de tothom.
    const out = compta(
      [fila({ retirat_at: '2026-10-20T10:00:00+00:00' }), fila({ user_id: 'bravo' })],
      CURS_DES_DE,
      CURS_FINS_A,
    )
    expect(out.has('alfa')).toBe(false)
    expect(out.has('bravo')).toBe(true)
  })

  it('deixa fora el que és d’abans del curs', () => {
    const out = compta(
      [fila({ created_at: '2026-06-30T20:00:00+00:00' })],
      CURS_DES_DE,
      CURS_FINS_A,
    )
    expect(out.get('alfa')).toBeUndefined()
  })

  it('i el del curs següent, amb el final exclusiu', () => {
    // El primer instant del curs que ve és del curs que ve: el mateix `<` que
    // fa `periode_curs()` dins d'`avisa()` per al sostre de punts.
    const just = compta([fila({ created_at: CURS_FINS_A })], CURS_DES_DE, CURS_FINS_A)
    expect(just.get('alfa')).toBeUndefined()

    // I el primer instant d'aquest curs sí que hi és: el començament és inclusiu.
    const primer = compta([fila({ created_at: CURS_DES_DE })], CURS_DES_DE, CURS_FINS_A)
    expect(primer.get('alfa')).toEqual({ quants: 1, pes: 1 })
  })

  it('un curs sense data de final els compta tots des del començament', () => {
    // És el cas de la llavor i del curs en marxa: `ranking_periods.ends_at` és
    // null per a la fila `global`, i `periode_curs()` torna null igual. Una
    // finestra oberta per un costat no vol dir «ningú».
    const out = compta([fila({ created_at: '2030-01-01T00:00:00+00:00' })], CURS_DES_DE, null)
    expect(out.get('alfa')).toEqual({ quants: 1, pes: 1 })
  })

  it('i sense cap dels dos límits compta tot el que hi ha', () => {
    const out = compta([fila({ created_at: '2001-01-01T00:00:00+00:00' })], null, null)
    expect(out.get('alfa')).toEqual({ quants: 1, pes: 1 })
  })
})

describe('si una fila es d’aquest curs', () => {
  // La fitxa d'un soci la fa servir per decidir quines dates porten l'any, i
  // `compta()` per decidir què suma: les dues respostes han de sortir d'aquí.
  it('ho és la que hi cau dins', () => {
    expect(dinsDelCurs('2026-10-14T20:00:00+00:00', CURS_DES_DE, CURS_FINS_A)).toBe(true)
  })

  it('no ho és la d’un curs anterior', () => {
    expect(dinsDelCurs('2023-11-04T21:00:00+00:00', CURS_DES_DE, CURS_FINS_A)).toBe(false)
  })

  it('el primer instant del curs que ve ja no hi és', () => {
    expect(dinsDelCurs(CURS_FINS_A, CURS_DES_DE, CURS_FINS_A)).toBe(false)
  })

  it('i el primer del curs sí', () => {
    expect(dinsDelCurs(CURS_DES_DE, CURS_DES_DE, CURS_FINS_A)).toBe(true)
  })

  it('amb la finestra oberta pels dos costats hi cau tot', () => {
    // Sense períodes configurats no hi ha curs, i llavors «fora del curs» no
    // vol dir res: la data es pinta com sempre i el comptador compta tot.
    expect(dinsDelCurs('2019-01-01T00:00:00+00:00', null, null)).toBe(true)
  })
})
