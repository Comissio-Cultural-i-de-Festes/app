import { describe, expect, it } from 'vitest'

import { memberSubtitle } from './subtitle'

/**
 * El cas que va motivar el fitxer és el tercer: un grau buit.
 *
 * `profiles.grau` és text lliure que s'escriu a l'alta, i un camp de text que
 * es desa sense tocar-lo torna `''` i no null. Un `filter(x => x !== null)`
 * el deixa passar, i la línia surt amb un separador flotant.
 */
describe('la línia de sota el nom', () => {
  it('uneix els quatre trossos amb el separador de l’app', () => {
    expect(
      memberSubtitle({
        escola: 'Politècnica',
        curs: '2n',
        grau: 'Informàtica',
        desDe: 'des de 2024',
      }),
    ).toBe('Politècnica · 2n · Informàtica · des de 2024')
  })

  it('no deixa cap separador penjat quan falta un tros', () => {
    expect(memberSubtitle({ escola: 'Salut', curs: null, grau: null, desDe: 'des de 2025' })).toBe(
      'Salut · des de 2025',
    )
  })

  it('tracta un grau buit com un grau que no hi és', () => {
    expect(memberSubtitle({ escola: 'Empresa', curs: '1r', grau: '   ', desDe: null })).toBe(
      'Empresa · 1r',
    )
  })

  it('amb res a dir no diu res, en comptes de dir un separador', () => {
    expect(memberSubtitle({ escola: null, curs: null, grau: null, desDe: null })).toBe('')
  })

  it('manté l’ordre: escola, curs, grau i des de quan', () => {
    expect(memberSubtitle({ escola: 'A', curs: 'B', grau: 'C', desDe: 'D' })).toBe('A · B · C · D')
  })
})
