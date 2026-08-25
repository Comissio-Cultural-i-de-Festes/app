import { beforeEach, describe, expect, it } from 'vitest'

import {
  type FailedCheckin,
  clearFailedCheckins,
  failedCheckins,
  forgetFailed,
  rememberFailed,
} from './failed'

const KEY = 'comi.checkin.failed'

function entry(over: Partial<FailedCheckin> = {}): FailedCheckin {
  return { id: 'a', eventId: 'e1', estat: 'lluny', metres: 230, takenAt: 1000, ...over }
}

describe('els fitxatges refusats', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('no en té cap de sortida', () => {
    expect(failedCheckins()).toEqual([])
  })

  it('en desa un i el torna', () => {
    rememberFailed(entry())
    expect(failedCheckins()).toEqual([entry()])
  })

  it('els torna del més vell al més nou', () => {
    rememberFailed(entry({ id: 'b', takenAt: 2000 }))
    rememberFailed(entry({ id: 'a', takenAt: 1000 }))
    expect(failedCheckins().map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('no duplica el mateix fitxatge quan la cua el reintenta', () => {
    rememberFailed(entry())
    rememberFailed(entry({ estat: 'tancat', metres: null }))
    expect(failedCheckins()).toHaveLength(1)
    expect(failedCheckins()[0]?.estat).toBe('tancat')
  })

  it("n'oblida un i deixa els altres", () => {
    rememberFailed(entry({ id: 'a' }))
    rememberFailed(entry({ id: 'b', takenAt: 2000 }))
    forgetFailed('a')
    expect(failedCheckins().map((row) => row.id)).toEqual(['b'])
  })

  // El telèfon es comparteix, i això diu on eres i quin dia.
  it('se buida en tancar sessió', () => {
    rememberFailed(entry())
    clearFailedCheckins()
    expect(failedCheckins()).toEqual([])
  })

  // Algú amb la consola oberta, o una versió antiga que hi desava una altra
  // cosa. Un avís que no surt és millor que una pantalla en blanc.
  it('sobreviu a un valor que no és una llista', () => {
    localStorage.setItem(KEY, '{"nope":true}')
    expect(failedCheckins()).toEqual([])
  })
})
