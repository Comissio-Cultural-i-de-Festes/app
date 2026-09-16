import { describe, expect, it } from 'vitest'

import type { AvisPeriode } from './avisosApi'
import { compta, passaElLlindar, quantsPassen } from './avisosCompte'

/**
 * El comptador que el llindar comparava contra res.
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

const fila = (over: Partial<AvisPeriode> = {}): AvisPeriode => ({
  user_id: 'alfa',
  gravetat: 1,
  created_at: '2026-10-14T20:00:00+00:00',
  retirat_at: null,
  ...over,
})

describe('comptar els avisos del curs', () => {
  it('suma els vius d’una persona', () => {
    const out = compta(
      [fila(), fila({ gravetat: 2, created_at: '2026-11-02T20:00:00+00:00' })],
      CURS_DES_DE,
      CURS_FINS_A,
    )
    expect(out.get('alfa')).toEqual({ quants: 2, gravetat: 3 })
  })

  it('i els separa per persona', () => {
    const out = compta([fila(), fila({ user_id: 'bravo', gravetat: 3 })], CURS_DES_DE, CURS_FINS_A)
    expect(out.get('alfa')).toEqual({ quants: 1, gravetat: 1 })
    expect(out.get('bravo')).toEqual({ quants: 1, gravetat: 3 })
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
    expect(primer.get('alfa')).toEqual({ quants: 1, gravetat: 1 })
  })

  it('un curs sense data de final els compta tots des del començament', () => {
    // És el cas de la llavor i del curs en marxa: `ranking_periods.ends_at` és
    // null per a la fila `global`, i `periode_curs()` torna null igual. Una
    // finestra oberta per un costat no vol dir «ningú».
    const out = compta([fila({ created_at: '2030-01-01T00:00:00+00:00' })], CURS_DES_DE, null)
    expect(out.get('alfa')).toEqual({ quants: 1, gravetat: 1 })
  })

  it('i sense cap dels dos límits compta tot el que hi ha', () => {
    const out = compta([fila({ created_at: '2001-01-01T00:00:00+00:00' })], null, null)
    expect(out.get('alfa')).toEqual({ quants: 1, gravetat: 1 })
  })
})

describe('el llindar', () => {
  it('es passa en tocar-lo, no en superar-lo', () => {
    // «Llindar 4» vol dir que amb quatre ja toca mirar-s'ho. Amb `>` la junta
    // que hi escrigués 4 en descobriria el sentit el dia que algú arribés a 5.
    expect(passaElLlindar({ quants: 2, gravetat: 4 }, 4)).toBe(true)
    expect(passaElLlindar({ quants: 2, gravetat: 3 }, 4)).toBe(false)
  })

  it('compara la gravetat i no el nombre d’avisos', () => {
    // Quatre avisos lleus i un de molt greu no són la mateixa cosa, i el pes és
    // justament el que aquest issue afegeix al registre.
    expect(passaElLlindar({ quants: 1, gravetat: 3 }, 3)).toBe(true)
    expect(passaElLlindar({ quants: 3, gravetat: 3 }, 4)).toBe(false)
  })

  it('amb zero no marca ningú', () => {
    // La sortida que la junta té per apagar la marca sense tocar cap esquema.
    expect(passaElLlindar({ quants: 9, gravetat: 27 }, 0)).toBe(false)
  })

  it('i qui no té cap avís tampoc', () => {
    expect(passaElLlindar(undefined, 1)).toBe(false)
  })

  it('i el rebedor compta quanta gent l’ha passat', () => {
    const comptes = new Map([
      ['alfa', { quants: 2, gravetat: 4 }],
      ['bravo', { quants: 1, gravetat: 1 }],
      ['charlie', { quants: 3, gravetat: 6 }],
    ])
    expect(quantsPassen(comptes, 4)).toBe(2)
    expect(quantsPassen(comptes, 7)).toBe(0)
    expect(quantsPassen(comptes, 0)).toBe(0)
  })
})
