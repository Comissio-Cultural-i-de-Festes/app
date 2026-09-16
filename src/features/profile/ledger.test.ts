import { describe, expect, it } from 'vitest'

import { puntsColor } from './ledger'

/**
 * El cas que va motivar el fitxer és el tercer: un total negatiu.
 *
 * El desglossament per motiu del perfil tenia el verd escrit a mà, i des que
 * `manual` i `avis` són motius del llibre major un motiu pot quedar en
 * negatiu. Un «−25» d'un avís sortia amb el color d'haver fet una cosa bé.
 */
describe('el color d’un import del llibre major', () => {
  it('suma en verd', () => {
    expect(puntsColor(20)).toBe('text-success')
  })

  it('resta en ambre, que és el destructiu d’aquest repositori', () => {
    expect(puntsColor(-20)).toBe('text-[var(--ds-warning)]')
  })

  it('un motiu compensat a zero no és una pèrdua', () => {
    expect(puntsColor(0)).toBe('text-success')
  })

  it('no fa servir mai el to de marca per a un estat', () => {
    expect([puntsColor(5), puntsColor(-5)].join(' ')).not.toMatch(/brand/)
  })
})
