import { describe, expect, it } from 'vitest'

import { enter, llegeixTipus, problemaDeLaClau, tipusValid } from './avisTipusForm'

/**
 * Les tres regles del catàleg, ara en un sol lloc.
 *
 * Abans vivien dues vegades dins d'`AvisTipusBlock` —una per a la fila que
 * s'edita i una per a la que s'afegeix— i no tenien cap prova. El cas que les
 * fa falta és el del signe menys: el camp és `type="text"` perquè al teclat de
 * l'iPhone el `-` no hi surt, i per tant el que hi arriba és una cadena que pot
 * ser qualsevol cosa.
 */

describe('llegir un tipus del catàleg', () => {
  it('accepta la fila normal', () => {
    expect(llegeixTipus({ gravetat: '2', punts: '-25' })).toEqual({
      gravetat: 2,
      punts_suggerits: -25,
    })
  })

  it('accepta zero punts, que és el primer avís', () => {
    // `mal_gest` neix amb zero a la migració 73: avisar sense tocar el rànquing
    // és el cas principal, no una vora.
    expect(llegeixTipus({ gravetat: '1', punts: '0' })).toEqual({
      gravetat: 1,
      punts_suggerits: 0,
    })
  })

  it('refusa uns punts positius', () => {
    expect(llegeixTipus({ gravetat: '1', punts: '25' })).toBe('punts')
  })

  it('refusa una gravetat fora de l’1 al 3', () => {
    expect(llegeixTipus({ gravetat: '4', punts: '-10' })).toBe('gravetat')
    expect(llegeixTipus({ gravetat: '0', punts: '-10' })).toBe('gravetat')
  })

  it('refusa una resta de més de cinc-cents', () => {
    expect(llegeixTipus({ gravetat: '3', punts: '-501' })).toBe('punts')
  })

  it('refusa el que no és un enter', () => {
    expect(llegeixTipus({ gravetat: '1', punts: '-2,5' })).toBe('punts')
    expect(llegeixTipus({ gravetat: '1', punts: 'menys deu' })).toBe('punts')
    expect(llegeixTipus({ gravetat: '1,5', punts: '-10' })).toBe('gravetat')
  })

  it('no diu res quan els dos camps són buits', () => {
    // Qui encara no ha escrit res no s'ha equivocat de res.
    expect(llegeixTipus({ gravetat: '', punts: '' })).toBeNull()
  })

  it('però un camp buit al costat d’un altre d’escrit sí que és un problema', () => {
    // EL CAS QUE `Number('')` FA PASSAR PER BO. `Number('')` és 0, o sigui que
    // un camp de punts buit valdria «zero punts» sense que ningú ho hagi
    // escrit, i el camp de gravetat buit valdria una gravetat 0 que la CHECK
    // refusa des de l'altra banda amb un 22023 intraduïble.
    expect(llegeixTipus({ gravetat: '', punts: '-10' })).toBe('gravetat')
    expect(llegeixTipus({ gravetat: '2', punts: '' })).toBe('punts')
  })

  it('i el guard diu què es pot enviar', () => {
    expect(tipusValid(llegeixTipus({ gravetat: '2', punts: '-25' }))).toBe(true)
    expect(tipusValid(llegeixTipus({ gravetat: '9', punts: '-25' }))).toBe(false)
    expect(tipusValid(null)).toBe(false)
  })
})

describe('el número que hi ha escrit', () => {
  it('llegeix el signe menys que el teclat numèric no té', () => {
    expect(enter('-25')).toBe(-25)
  })

  it('perdona els espais de voltant', () => {
    expect(enter('  -25  ')).toBe(-25)
  })

  it('i el buit no és zero', () => {
    expect(enter('')).toBeNull()
    expect(enter('   ')).toBeNull()
  })
})

describe('la clau d’un tipus nou', () => {
  it('accepta la forma que la CHECK demana', () => {
    expect(problemaDeLaClau('se_en_va_aviat', ['greu'])).toBeNull()
  })

  it('refusa majúscules, accents i espais', () => {
    // El cas real: la junta escriu el nom tal com es llegeix. Fins ara això
    // només apagava el botó, sense dir-ne res.
    expect(problemaDeLaClau('Se En Va', [])).toBe('forma')
    expect(problemaDeLaClau('se_en_và', [])).toBe('forma')
    expect(problemaDeLaClau('se en va', [])).toBe('forma')
  })

  it('refusa una clau que comenci per guió baix o per número', () => {
    expect(problemaDeLaClau('_greu', [])).toBe('forma')
    expect(problemaDeLaClau('2greu', [])).toBe('forma')
  })

  it('refusa una clau massa llarga', () => {
    // 24 caràcters és el sostre de la CHECK: una lletra més i la RPC torna
    // 22023 després d'haver deixat prémer el botó.
    expect(problemaDeLaClau('a'.repeat(24), [])).toBeNull()
    expect(problemaDeLaClau('a'.repeat(25), [])).toBe('forma')
  })

  it('refusa una que ja hi és', () => {
    expect(problemaDeLaClau('greu', ['no_va_venir', 'greu'])).toBe('repetida')
  })

  it('i no es queixa d’un camp encara buit', () => {
    expect(problemaDeLaClau('', ['greu'])).toBeNull()
    expect(problemaDeLaClau('   ', ['greu'])).toBeNull()
  })
})
