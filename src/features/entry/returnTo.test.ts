import { beforeEach, describe, expect, it } from 'vitest'

import { isReturnPath, rememberReturn, takeReturn } from './returnTo'

const NOW = new Date('2026-11-20T20:00:00Z').getTime()
const EVENT = '/esdeveniment/3f1c2a9e-0b7d-4c55-9a41-2d8e6f7a1b30'
const KEY = 'comi.return.to'

beforeEach(() => {
  localStorage.clear()
})

describe('quines rutes es poden recordar', () => {
  it.each([EVENT, `${EVENT}/dins`, `${EVENT}/gimcana/marcador`, '/esdeveniment/abc'])(
    'accepta %s',
    (path) => {
      expect(isReturnPath(path)).toBe(true)
    },
  )

  it.each([
    '//evil.example/esdeveniment/x',
    'https://evil.example/esdeveniment/x',
    'javascript:alert(1)',
    '/\\evil.example',
    '/esdeveniment/../junta',
    '/esdeveniment/',
    '/esdeveniment/x?codi=ABC',
    '/esdeveniment/x#a',
    '/esdeveniment/%2e%2e/junta',
    '/junta/socis',
    '/primer-cop',
    '/',
    '',
    'esdeveniment/x',
  ])('rebutja %s', (path) => {
    expect(isReturnPath(path)).toBe(false)
  })
})

describe('recordar i recollir', () => {
  it('es recull un sol cop', () => {
    rememberReturn(EVENT, NOW)
    expect(takeReturn(NOW + 1000)).toBe(EVENT)
    expect(takeReturn(NOW + 2000)).toBeNull()
  })

  it("caduca als quinze minuts, i en caducar s'esborra", () => {
    rememberReturn(EVENT, NOW)
    expect(takeReturn(NOW + 16 * 60 * 1000)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('una ruta no permesa no es desa i esborra la de abans', () => {
    rememberReturn(EVENT, NOW)
    rememberReturn('/junta/socis', NOW)
    expect(takeReturn(NOW)).toBeNull()
  })

  it("ignora el que hi hagi a l'emmagatzematge si no passa la validació", () => {
    localStorage.setItem(KEY, JSON.stringify({ path: '//evil.example', at: NOW }))
    expect(takeReturn(NOW)).toBeNull()
    localStorage.setItem(KEY, JSON.stringify({ path: 'https://evil.example/', at: NOW }))
    expect(takeReturn(NOW)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('ignora el que no és JSON o no té la forma', () => {
    localStorage.setItem(KEY, 'no és json')
    expect(takeReturn(NOW)).toBeNull()
    localStorage.setItem(KEY, JSON.stringify({ path: EVENT }))
    expect(takeReturn(NOW)).toBeNull()
  })

  it('un rellotge enrere no la fa viure per sempre', () => {
    rememberReturn(EVENT, NOW)
    expect(takeReturn(NOW - 60 * 60 * 1000)).toBeNull()
  })
})
