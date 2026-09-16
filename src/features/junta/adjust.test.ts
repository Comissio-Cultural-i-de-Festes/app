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
