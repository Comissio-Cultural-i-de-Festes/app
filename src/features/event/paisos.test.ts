import { describe, expect, it } from 'vitest'

import { CODIS_PAIS, nomDelPais, paisosOrdenats } from './paisos'

describe('els països', () => {
  it('són els 249 codis de l’estàndard, sense repetits', () => {
    expect(CODIS_PAIS).toHaveLength(249)
    expect(new Set(CODIS_PAIS).size).toBe(249)
    expect(CODIS_PAIS.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true)
  })

  it('el nom surt en la llengua de qui mira', () => {
    expect(nomDelPais('ES', 'ca')).toBe('Espanya')
    expect(nomDelPais('ES', 'es')).toBe('España')
    expect(nomDelPais('DE', 'en')).toBe('Germany')
  })

  it('Espanya va al davant, i la resta per ordre alfabètic', () => {
    const llista = paisosOrdenats('ca')
    expect(llista[0]).toEqual({ codi: 'ES', nom: 'Espanya' })
    expect(llista[1]?.codi).toBe('AF')
    expect(llista).toHaveLength(249)
  })
})
