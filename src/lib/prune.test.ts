import { describe, expect, it } from 'vitest'

import { RECENT_MS, staleIn } from './prune'

const NOW = Date.parse('2026-11-19T12:00:00Z')
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()

describe('staleIn', () => {
  const listed = [
    { name: '100.jpg', id: 'a', created_at: at(60) },
    { name: '200.jpg', id: 'b', created_at: at(30) },
    { name: '300.webp', id: 'c', created_at: at(20) },
  ]

  it('torna el que és més vell que el que es queda', () => {
    expect(staleIn('u', listed, 'u/300.webp', NOW)).toEqual(['u/100.jpg', 'u/200.jpg'])
  })

  it('i no el que és més nou: dues pujades alhora no s’esborren l’una a l’altra', () => {
    // Aquest mòbil ha desat la 200 després que un altre desés la 300: si
    // escombrés tota la resta, la fila de l'altre podria quedar apuntant a un
    // objecte esborrat. La 300 es deixa per a l'escombrada diària.
    expect(staleIn('u', listed, 'u/200.jpg', NOW)).toEqual(['u/100.jpg'])
  })

  it('sense res a guardar, ho torna tot menys el dels últims minuts', () => {
    const fresh = [...listed, { name: '400.jpg', id: 'd', created_at: at(1) }]
    expect(staleIn('u', fresh, null, NOW)).toEqual(['u/100.jpg', 'u/200.jpg', 'u/300.webp'])
  })

  it('una adreça de fora (la foto de Google) es tracta com no guardar res', () => {
    expect(staleIn('u', listed, 'https://lh3.googleusercontent.com/a/x', NOW)).toHaveLength(3)
  })

  it('la vora dels minuts és la que diu RECENT_MS', () => {
    const edge = [{ name: '1.jpg', id: 'a', created_at: new Date(NOW - RECENT_MS).toISOString() }]
    expect(staleIn('u', edge, null, NOW)).toEqual([])
    const older = [
      { name: '1.jpg', id: 'a', created_at: new Date(NOW - RECENT_MS - 1).toISOString() },
    ]
    expect(staleIn('u', older, null, NOW)).toEqual(['u/1.jpg'])
  })

  it('el que no porta data no s’esborra', () => {
    expect(staleIn('u', [{ name: '1.jpg', id: 'a' }], null, NOW)).toEqual([])
  })

  it('no toca les subcarpetes, que la llista dona amb id null', () => {
    const withFolder = [{ name: 'u', id: null, created_at: null }, ...listed]
    expect(staleIn('entrada/e', withFolder, null, NOW)).not.toContain('entrada/e/u')
  })

  it('no s’emporta mai el que es queda', () => {
    expect(staleIn('u', listed, 'u/100.jpg', NOW)).toEqual([])
  })

  it('carpeta buida, res a treure', () => {
    expect(staleIn('u', [], 'u/1.jpg', NOW)).toEqual([])
  })
})
