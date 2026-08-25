import { beforeAll, describe, expect, it } from 'vitest'

import i18n from '@/i18n'
import type { Locale } from '@/i18n/locales'

import { movementLine } from './movementLine'

/**
 * The pulsing line under the sign-up button.
 *
 * Against the real translations rather than a stub, because what can go wrong
 * here is the copy and not the code: the first version read "Bravo i Echo i 2
 * més s'han apuntat avui", with the conjunction twice, and no amount of
 * testing a fake `t` would have caught it.
 */

const NAMES = ['Alfa Bravo', 'Charlie Delta', 'Echo Foxtrot', 'Golf Hotel']

async function line(locale: Locale, names: readonly string[]): Promise<string> {
  await i18n.changeLanguage(locale)
  return movementLine(names, i18n.t.bind(i18n))
}

beforeAll(async () => {
  await i18n.changeLanguage('ca')
})

describe('who signed up today', () => {
  it('agrees the verb with one person', async () => {
    expect(await line('ca', NAMES.slice(0, 1))).toBe("S'hi ha apuntat avui: Alfa")
  })

  it('joins two names with the conjunction and no count', async () => {
    expect(await line('ca', NAMES.slice(0, 2))).toBe("S'hi han apuntat avui: Alfa i Charlie")
  })

  it('uses a comma before a trailing count, not a second conjunction', async () => {
    // The bug this replaced: "Alfa i Charlie i 2 més".
    expect(await line('ca', NAMES)).toBe("S'hi han apuntat avui: Alfa, Charlie i 2 més")
  })

  it('never names more than two, however many there are', async () => {
    const many = Array.from({ length: 30 }, (_, i) => `Persona${String(i)} Cognom`)
    expect(await line('ca', many)).toBe("S'hi han apuntat avui: Persona0, Persona1 i 28 més")
  })

  it('uses first names only, because that is what everyone calls each other', async () => {
    expect(await line('ca', ['Alfa Bravo Charlie'])).toBe("S'hi ha apuntat avui: Alfa")
  })
})

describe('the same line in the other two languages', () => {
  it('agrees the verb in Spanish too', async () => {
    expect(await line('es', NAMES.slice(0, 1))).toBe('Se ha apuntado hoy: Alfa')
    expect(await line('es', NAMES)).toBe('Se han apuntado hoy: Alfa, Charlie y 2 más')
  })

  it('needs no agreement in English, and says so with the same string twice', async () => {
    expect(await line('en', NAMES.slice(0, 1))).toBe('Signed up today: Alfa')
    expect(await line('en', NAMES)).toBe('Signed up today: Alfa, Charlie and 2 more')
  })
})
