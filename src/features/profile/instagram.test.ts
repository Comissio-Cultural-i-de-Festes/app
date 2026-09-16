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
    // Amb `/^…$/` sense `\n` a la classe això passaria en JavaScript —`$`
    // casa abans d'un salt final— i llavors el client diria que sí a una cosa
    // que la base de dades refusa amb un 23514.
    expect(isInstagramHandle('la_comi\n')).toBe(false)
    expect(isInstagramHandle('la_comi\nhttps://el-que-sigui')).toBe(false)
  })
})

describe('instagramUrl', () => {
  it('construeix l’enllaç en un sol lloc', () => {
    expect(instagramUrl('la_comi')).toBe('https://instagram.com/la_comi')
  })
})
