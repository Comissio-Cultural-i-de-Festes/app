import { describe, expect, it } from 'vitest'

import { escolaKey } from './escolaLabel'

describe('escolaKey', () => {
  it('amb escola, la curta de l’escola', () => {
    expect(escolaKey({ escola: 'salut', extern: false })).toBe('escolaShort.salut')
  })

  it('un extern diu que ve de fora', () => {
    expect(escolaKey({ escola: null, extern: true })).toBe('extern')
  })

  it('sense escola i sense ser extern, res: encara no ha contestat', () => {
    expect(escolaKey({ escola: null, extern: false })).toBeNull()
  })

  it('i si la consulta no porta la columna, com abans', () => {
    expect(escolaKey({ escola: null })).toBeNull()
    expect(escolaKey({ escola: 'empresa' })).toBe('escolaShort.empresa')
  })
})
