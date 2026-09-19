import { describe, expect, it } from 'vitest'

import { notaNeta } from './notaNeta'

/**
 * Els caràcters que separen aquesta funció de `String.prototype.trim()`.
 *
 * NO SÓN UN CATÀLEG D'UNICODE: els sis primers són exactament els que `trim()`
 * deixa passar i `private.nota_neta` no. Si algú torna a escriure
 * `camps.nota.trim()` a `adjust.ts`, cauen aquests sis i no els altres, que és
 * el senyal que fa falta per saber què s'ha desfet.
 *
 * Els punts de codi s'escriuen amb `String.fromCodePoint` i no com a literals
 * perquè un fitxer ple de caràcters invisibles no es pot llegir ni revisar.
 */

const c = (punt: number) => String.fromCodePoint(punt)

/** El que `trim()` no veu i la base sí. */
const NOMES_NOTA_NETA: readonly (readonly [string, string])[] = [
  ['el separador de fitxer', c(0x001c)],
  ['el separador de grup', c(0x001d)],
  ['el separador de registre', c(0x001e)],
  ['el separador d’unitat', c(0x001f)],
  ['el salt de línia dels terminals', c(0x0085)],
  ['l’espai d’amplada zero', c(0x200b)],
]

/** El que veuen totes dues. */
const TOTES_DUES: readonly (readonly [string, string])[] = [
  ['l’espai', c(0x0020)],
  ['el tabulador', c(0x0009)],
  ['el salt de línia', c(0x000a)],
  ['el retorn de carro', c(0x000d)],
  ['el tabulador vertical', c(0x000b)],
  ['el salt de pàgina', c(0x000c)],
  ['l’espai dur', c(0x00a0)],
  ['l’espai d’ogham', c(0x1680)],
  ['l’espai de l’amplada d’una xifra', c(0x2007)],
  ['el separador de línia', c(0x2028)],
  ['el separador de paràgraf', c(0x2029)],
  ['l’espai estret dur', c(0x202f)],
  ['l’espai matemàtic mitjà', c(0x205f)],
  ['l’espai ideogràfic', c(0x3000)],
  ['la marca d’ordre de bytes', c(0xfeff)],
]

describe('una nota que només són blancs no és una nota', () => {
  it.each(NOMES_NOTA_NETA)('%s, que `trim()` deixaria passar', (_nom, blanc) => {
    expect(notaNeta(blanc)).toBe('')
  })

  it.each(TOTES_DUES)('%s', (_nom, blanc) => {
    expect(notaNeta(blanc)).toBe('')
  })

  it('i tots junts tampoc', () => {
    const tots = [...NOMES_NOTA_NETA, ...TOTES_DUES].map(([, blanc]) => blanc).join('')
    expect(notaNeta(tots)).toBe('')
  })

  it('el buit continua sent buit, que és el formulari acabat d’obrir', () => {
    expect(notaNeta('')).toBe('')
  })
})

describe('una nota de debò no es perd', () => {
  it('encara que hi vagi enganxat el que s’enganxa copiant d’un full de càlcul', () => {
    const escrita = c(0xfeff) + c(0x00a0) + 'quota de setembre' + c(0x3000) + c(0x200b)
    expect(notaNeta(escrita)).toBe('quota de setembre')
  })

  it('i els blancs de dins no es toquen: només es retallen els extrems', () => {
    expect(notaNeta('  dues  nits  ')).toBe('dues  nits')
    expect(notaNeta(`primera${c(0x000a)}segona`)).toBe(`primera${c(0x000a)}segona`)
  })

  it('i el que no és blanc no es toca, encara que no es vegi', () => {
    // La tanca de l'altra banda. Una llista que s'allargués fins a menjar-se
    // caràcters que la base accepta donaria «falta la nota» amb la nota
    // escrita, i aquest error no té manera de resoldre'l qui el veu.
    expect(notaNeta('_')).toBe('_')
    expect(notaNeta(c(0x200c))).toBe(c(0x200c)) // el no-unidor d'amplada zero
    expect(notaNeta(c(0x2060))).toBe(c(0x2060)) // l'unidor de paraules
  })
})
