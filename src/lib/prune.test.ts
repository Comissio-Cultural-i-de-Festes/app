import { describe, expect, it } from 'vitest'

import { staleIn } from './prune'

const NOW = Date.parse('2026-11-19T12:00:00Z')
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()

describe('staleIn', () => {
  const listed = [
    { name: '100.jpg', id: 'a', created_at: at(60) },
    { name: '200.jpg', id: 'b', created_at: at(30) },
    { name: '300.webp', id: 'c', created_at: at(20) },
  ]

  it('torna el que és més vell que el que es queda', () => {
    expect(staleIn('u', listed, 'u/300.webp')).toEqual(['u/100.jpg', 'u/200.jpg'])
  })

  it('i no el que és més nou: dues pujades alhora no s’esborren l’una a l’altra', () => {
    // Aquest mòbil ha desat la 200 després que un altre desés la 300: si
    // escombrés tota la resta, la fila de l'altre podria quedar apuntant a un
    // objecte esborrat. La 300 es deixa per a l'escombrada diària.
    expect(staleIn('u', listed, 'u/200.jpg')).toEqual(['u/100.jpg'])
  })

  it('no s’emporta mai el que es queda', () => {
    expect(staleIn('u', listed, 'u/100.jpg')).toEqual([])
  })

  it('sense res a guardar, se’n va tota la carpeta', () => {
    expect(staleIn('u', listed, null)).toEqual(['u/100.jpg', 'u/200.jpg', 'u/300.webp'])
  })

  it('una adreça de fora (la foto de Google) és com no guardar res', () => {
    expect(staleIn('u', listed, 'https://lh3.googleusercontent.com/a/x')).toHaveLength(3)
  })

  it('si el que es guarda no porta data, no s’esborra res', () => {
    const undated = [
      { name: '1.jpg', id: 'a', created_at: at(60) },
      { name: '2.jpg', id: 'b' },
    ]
    expect(staleIn('u', undated, 'u/2.jpg')).toEqual([])
  })

  it('i el que no porta data no s’esborra al costat d’un que sí', () => {
    const mixed = [{ name: '1.jpg', id: 'a' }, ...listed]
    expect(staleIn('u', mixed, 'u/300.webp')).not.toContain('u/1.jpg')
  })

  it('no toca les subcarpetes, que la llista dona amb id null', () => {
    const withFolder = [{ name: 'u', id: null, created_at: null }, ...listed]
    expect(staleIn('entrada/e', withFolder, null)).not.toContain('entrada/e/u')
  })

  it('carpeta buida, res a treure', () => {
    expect(staleIn('u', [], 'u/1.jpg')).toEqual([])
  })
})
