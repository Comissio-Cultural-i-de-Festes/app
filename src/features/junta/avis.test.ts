import { describe, expect, it } from 'vitest'

import { avisValid, llegeixAvis, notaValida } from './avis'

/**
 * El que `avisa()` refusaria, refusat abans d'apretar.
 *
 * La diferència que val la pena escriure és amb `adjust.ts`: allà zero NO és un
 * ajust —una fila de zero punts al llibre major és soroll amb data— i aquí zero
 * SÍ que és un avís, perquè es pot avisar sense tocar el rànquing. Les dues
 * regles semblen la mateixa i diuen el contrari.
 */

describe('llegir un avís', () => {
  it('accepta el cas normal', () => {
    expect(
      llegeixAvis({ tipus: 'va_deixar_ho', punts: '-25', nota: 'ho va deixar obert' }),
    ).toEqual({ tipus: 'va_deixar_ho', punts: -25, nota: 'ho va deixar obert' })
  })

  it('accepta zero punts, que és el primer avís', () => {
    // Al contrari que un ajust manual: avisar sense restar és el cas que separa
    // un avís d'una resta de punts, i `avis_tipus.mal_gest` neix amb zero.
    expect(llegeixAvis({ tipus: 'mal_gest', punts: '0', nota: 'un mal gest' })).toEqual({
      tipus: 'mal_gest',
      punts: 0,
      nota: 'un mal gest',
    })
  })

  it('refusa uns punts positius: un avís no en dona', () => {
    expect(llegeixAvis({ tipus: 'greu', punts: '10', nota: 'per què no' })).toBe('punts')
  })

  it('refusa una resta de més de cinc-cents', () => {
    expect(llegeixAvis({ tipus: 'greu', punts: '-600', nota: 'massa' })).toBe('punts')
  })

  it('refusa el que no és un enter', () => {
    expect(llegeixAvis({ tipus: 'greu', punts: '-2,5', nota: 'quant?' })).toBe('punts')
  })

  it('refusa una nota en blanc', () => {
    expect(llegeixAvis({ tipus: 'greu', punts: '-50', nota: '' })).toBe('nota')
  })

  it('i tres espais tampoc no són una nota', () => {
    // La mateixa vora que `avisa()` mira amb `btrim`: una nota d'espais és una
    // nota buida amb una altra cara.
    expect(llegeixAvis({ tipus: 'greu', punts: '-50', nota: '   ' })).toBe('nota')
  })

  it('no diu res mentre no s’ha triat el tipus', () => {
    // El primer camp de la pantalla. Ensenyar «falta el per què» abans de saber
    // de què va faria mirar el camp equivocat.
    expect(llegeixAvis({ tipus: '', punts: '', nota: '' })).toBeNull()
    expect(llegeixAvis({ tipus: '', punts: '-25', nota: 'escrit' })).toBeNull()
  })

  it('ni mentre el camp de punts encara està buit i no s’ha escrit res més', () => {
    expect(llegeixAvis({ tipus: 'greu', punts: '', nota: '' })).toBeNull()
  })

  it('però un camp de punts buit amb la nota escrita sí que es queixa', () => {
    // `Number('')` és 0, i sense aquesta branca un camp buit passaria per «zero
    // punts» sense que ningú ho hagi escrit.
    expect(llegeixAvis({ tipus: 'greu', punts: '', nota: 'escrit' })).toBe('punts')
  })

  it('i el guard diu què es pot enviar', () => {
    expect(avisValid(llegeixAvis({ tipus: 'greu', punts: '0', nota: 'va' }))).toBe(true)
    expect(avisValid(llegeixAvis({ tipus: 'greu', punts: '5', nota: 'va' }))).toBe(false)
    expect(avisValid(null)).toBe(false)
  })
})

describe('la nota de la retirada', () => {
  it('demana que hi hagi alguna cosa escrita', () => {
    expect(notaValida('havia avisat, error nostre')).toBe(true)
    expect(notaValida('')).toBe(false)
    expect(notaValida('   ')).toBe(false)
  })

  it('i no passa de cinc-cents caràcters', () => {
    // El sostre és de la columna i de la RPC: passar-lo torna 22023, que la
    // pantalla només sabria traduir per «alguna cosa ha anat malament».
    expect(notaValida('a'.repeat(500))).toBe(true)
    expect(notaValida('a'.repeat(501))).toBe(false)
  })
})
