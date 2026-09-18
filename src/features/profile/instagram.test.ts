import { describe, expect, it } from 'vitest'

import { INSTAGRAM_MAX, instagramUrl, isInstagramHandle, normaliseInstagram } from './instagram'

describe('normaliseInstagram', () => {
  it('treu l’arrova del davant, que és com la gent l’escriu', () => {
    expect(normaliseInstagram('@la_comi')).toBe('la_comi')
  })

  it('i els espais de les vores, que és el que enganxa un mòbil', () => {
    expect(normaliseInstagram('  la_comi  ')).toBe('la_comi')
  })

  it('l’arrova després dels espais també', () => {
    expect(normaliseInstagram(' @la_comi ')).toBe('la_comi')
  })

  it('buit passa a null, perquè la columna refusa la cadena buida', () => {
    expect(normaliseInstagram('')).toBeNull()
    expect(normaliseInstagram('   ')).toBeNull()
    expect(normaliseInstagram('@')).toBeNull()
  })

  it('no arregla res més: el que no val, no val', () => {
    // Si això tornés un nom «net» a partir d'una URL, el camp diria que sí a
    // una cosa que la persona no ha escrit. Que ho vegi i ho corregeixi.
    expect(normaliseInstagram('https://instagram.com/la_comi')).toBe(
      'https://instagram.com/la_comi',
    )
    expect(normaliseInstagram('dos noms')).toBe('dos noms')
  })

  it('i un salt de línia interior sobreviu al trim, que és el que el fa perillós', () => {
    // El `trim` es menja els salts de les vores, o sigui que un salt FINAL no
    // arriba mai a `isInstagramHandle` des del camp. L'interior sí, i és el que
    // portaria una segona ratlla dins del valor. Aquesta prova és la que lliga
    // les dues funcions: el que la normalització deixa passar, la validació ho
    // ha de refusar.
    const amb = normaliseInstagram(' la_comi\nhttps://el-que-sigui ')
    expect(amb).toBe('la_comi\nhttps://el-que-sigui')
    expect(isInstagramHandle(amb!)).toBe(false)
  })
})

describe('isInstagramHandle', () => {
  it('accepta el que accepta Instagram', () => {
    expect(isInstagramHandle('la.comi_2026')).toBe(true)
    expect(isInstagramHandle('a')).toBe(true)
    expect(isInstagramHandle('a'.repeat(INSTAGRAM_MAX))).toBe(true)
  })

  it('i refusa exactament el que refusa la columna', () => {
    expect(isInstagramHandle('')).toBe(false)
    expect(isInstagramHandle('@la_comi')).toBe(false)
    expect(isInstagramHandle('https://instagram.com/la_comi')).toBe(false)
    expect(isInstagramHandle('javascript:alert(1)')).toBe(false)
    expect(isInstagramHandle('dos noms')).toBe(false)
    expect(isInstagramHandle('a'.repeat(INSTAGRAM_MAX + 1))).toBe(false)
    expect(isInstagramHandle('accentuàt')).toBe(false)
  })

  it('i una segona ratlla, que és per on se n’escapen les expressions regulars', () => {
    // El que vigila això és la BANDERA del patró, no cap salt final: sense `m`
    // el `$` de JavaScript ja només casa al final del text. Afegir-hi `m` faria
    // que casés al final de la primera línia, i llavors el segon cas passaria
    // per aquí mentre la columna el refusa amb un 23514.
    expect(isInstagramHandle('la_comi\n')).toBe(false)
    expect(isInstagramHandle('la_comi\nhttps://el-que-sigui')).toBe(false)
  })
})

describe('instagramUrl', () => {
  it('construeix l’enllaç en un sol lloc', () => {
    expect(instagramUrl('la_comi')).toBe('https://instagram.com/la_comi')
  })
})
