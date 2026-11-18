import { describe, expect, it } from 'vitest'

import { staleIn } from './prune'

describe('staleIn', () => {
  const listed = [
    { name: '100.jpg', id: 'a' },
    { name: '200.jpg', id: 'b' },
    { name: '300.webp', id: 'c' },
  ]

  it('torna tot el que hi ha a la carpeta menys el que es queda', () => {
    expect(staleIn('u', listed, 'u/200.jpg')).toEqual(['u/100.jpg', 'u/300.webp'])
  })

  it('sense res a guardar, ho torna tot', () => {
    expect(staleIn('u', listed, null)).toEqual(['u/100.jpg', 'u/200.jpg', 'u/300.webp'])
  })

  it('una adreça de fora (la foto de Google) no protegeix res del bucket', () => {
    expect(staleIn('u', listed, 'https://lh3.googleusercontent.com/a/x')).toHaveLength(3)
  })

  it('no toca les subcarpetes, que la llista dona amb id null', () => {
    expect(staleIn('entrada/e', [{ name: 'u', id: null }, ...listed], null)).not.toContain(
      'entrada/e/u',
    )
  })

  it('no s’emporta mai el que es queda, encara que surti dues vegades', () => {
    const twice = [...listed, { name: '200.jpg', id: 'd' }]
    expect(staleIn('u', twice, 'u/200.jpg')).not.toContain('u/200.jpg')
  })

  it('carpeta buida, res a treure', () => {
    expect(staleIn('u', [], 'u/1.jpg')).toEqual([])
  })
})
