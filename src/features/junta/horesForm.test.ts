import { describe, expect, it } from 'vitest'

import { campsDesDeMinuts, minutsDesDeCamps } from './horesForm'

/**
 * La conversió entre els dos camps i el número que va a la base.
 *
 * El que hi ha en joc és que el botó de desar no s'apagui quan no toca i no
 * s'encengui quan sí: un «Desa» viu amb seixanta minuts al camp dels minuts
 * enviaria una xifra que la RPC accepta i que no és la que la persona creu
 * haver escrit.
 */

describe('dels minuts als camps', () => {
  it('parteix la durada en hores i minuts', () => {
    expect(campsDesDeMinuts(150)).toEqual({ hores: '2', minuts: '30' })
  })

  it('i una hora justa deixa el camp dels minuts a zero', () => {
    expect(campsDesDeMinuts(60)).toEqual({ hores: '1', minuts: '0' })
  })

  it('per sota d’una hora, les hores són zero', () => {
    expect(campsDesDeMinuts(45)).toEqual({ hores: '0', minuts: '45' })
  })
})

describe('dels camps als minuts', () => {
  it('els suma', () => {
    expect(minutsDesDeCamps({ hores: '2', minuts: '30' })).toBe(150)
  })

  // Qui esborra el camp per escriure'n un altre no ha de veure el botó
  // apagar-se-li a mitja frase.
  it('i un camp buit val zero, no invàlid', () => {
    expect(minutsDesDeCamps({ hores: '2', minuts: '' })).toBe(120)
    expect(minutsDesDeCamps({ hores: '', minuts: '45' })).toBe(45)
    expect(minutsDesDeCamps({ hores: '', minuts: '' })).toBe(0)
  })

  // Seixanta minuts no són minuts: són una hora que va al camp del costat, i
  // acceptar-ho desaria una xifra que no és la que s'ha escrit.
  it('no accepta seixanta minuts ni més', () => {
    expect(minutsDesDeCamps({ hores: '1', minuts: '60' })).toBeNull()
    expect(minutsDesDeCamps({ hores: '0', minuts: '90' })).toBeNull()
  })

  it('ni res que no sigui un enter positiu', () => {
    expect(minutsDesDeCamps({ hores: 'dues', minuts: '0' })).toBeNull()
    expect(minutsDesDeCamps({ hores: '-1', minuts: '0' })).toBeNull()
    expect(minutsDesDeCamps({ hores: '1,5', minuts: '0' })).toBeNull()
    expect(minutsDesDeCamps({ hores: '1.5', minuts: '0' })).toBeNull()
  })

  // El mateix sostre que la columna de la base, o el desat petaria amb un
  // 23514 que no es pot ensenyar a ningú.
  it('i no passa dels tres dies que la base accepta', () => {
    expect(minutsDesDeCamps({ hores: '72', minuts: '0' })).toBe(4320)
    expect(minutsDesDeCamps({ hores: '72', minuts: '1' })).toBeNull()
  })
})
