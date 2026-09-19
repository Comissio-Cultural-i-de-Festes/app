import { describe, expect, it } from 'vitest'

import { MAX_AJUST, esValid, llegeixAjust } from './adjust'

/**
 * El que s'envia i el que no.
 *
 * El que hi ha en joc no és el botó: és que la nota hi sigui. Un ajust sense
 * nota el refusa la migració 72 amb 22023, que al client es tradueix a
 * «errors.generic» —«alguna cosa ha anat malament»— i qui l'ha escrit no sap
 * que li falta el per què. Aquestes proves són les que fan que això no arribi
 * mai a passar per aquest camí.
 */

describe('un ajust que es pot enviar', () => {
  it('suma', () => {
    expect(llegeixAjust({ punts: '20', nota: 'Va portar el projector' })).toEqual({
      punts: 20,
      nota: 'Va portar el projector',
    })
  })

  it('i resta, que és la meitat que no existia', () => {
    expect(llegeixAjust({ punts: '-20', nota: 'Comptats dos cops' })).toEqual({
      punts: -20,
      nota: 'Comptats dos cops',
    })
  })

  it('amb la nota retallada, com la desa la base', () => {
    expect(llegeixAjust({ punts: '5', nota: '   dues nits   ' })).toEqual({
      punts: 5,
      nota: 'dues nits',
    })
  })

  it('i el sostre és el de la RPC, ni un punt més', () => {
    expect(esValid(llegeixAjust({ punts: String(MAX_AJUST), nota: 'x' }))).toBe(true)
    expect(llegeixAjust({ punts: String(MAX_AJUST + 1), nota: 'x' })).toBe('punts')
    expect(llegeixAjust({ punts: String(-MAX_AJUST - 1), nota: 'x' })).toBe('punts')
  })
})

describe('el que falta', () => {
  // Qui encara no ha escrit res no s'ha equivocat de res: el formulari acabat
  // d'obrir no ha de sortir amb dues vores vermelles.
  it('un formulari buit no és cap error, és un formulari buit', () => {
    expect(llegeixAjust({ punts: '', nota: '' })).toBeNull()
  })

  it('la nota sense punts sí que ho és, perquè algú ja ha començat', () => {
    expect(llegeixAjust({ punts: '', nota: 'perquè sí' })).toBe('punts')
  })

  it('i els punts sense nota són el cas que la migració 72 refusa', () => {
    expect(llegeixAjust({ punts: '20', nota: '' })).toBe('nota')
  })

  it('una nota de tres espais és una nota buida amb una altra cara', () => {
    expect(llegeixAjust({ punts: '20', nota: '   ' })).toBe('nota')
  })

  /**
   * ELS BLANCS QUE `trim()` NO VEU, mirats des d'aquí i no només des de
   * `notaNeta.test.ts`: el que es va separar de la base no va ser la llista,
   * va ser aquesta crida. Amb `camps.nota.trim()` les tres passen el formulari
   * i és `award_points` qui les refusa amb 22023 —a la pantalla, «Torna-ho a
   * provar d'aquí un moment»—, i aquest fitxer es quedava verd.
   */
  it.each([
    ['l’espai d’amplada zero', String.fromCodePoint(0x200b)],
    ['el salt de línia dels terminals', String.fromCodePoint(0x0085)],
    ['el separador d’unitat', String.fromCodePoint(0x001f)],
  ])('ni una nota que només és %s, que és el que la base refusa', (_nom, blanc) => {
    expect(llegeixAjust({ punts: '20', nota: blanc })).toBe('nota')
  })

  it('i la nota que s’envia és la que la base desarà, sense els extrems', () => {
    const enganxada = `${String.fromCodePoint(0xfeff)}quota de setembre${String.fromCodePoint(0x3000)}`
    expect(llegeixAjust({ punts: '-3', nota: enganxada })).toEqual({
      punts: -3,
      nota: 'quota de setembre',
    })
  })
})

describe('el que no és un número', () => {
  it('zero no és un ajust', () => {
    expect(llegeixAjust({ punts: '0', nota: 'res' })).toBe('punts')
  })

  it('ni un decimal, que la columna és int', () => {
    expect(llegeixAjust({ punts: '2.5', nota: 'res' })).toBe('punts')
  })

  it('ni una paraula', () => {
    expect(llegeixAjust({ punts: 'molts', nota: 'res' })).toBe('punts')
  })
})
