import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { rememberReturn, takeReturn } from './returnTo'
import { useForgetReturn } from './useForgetReturn'

const EVENT = '/esdeveniment/abc'

beforeEach(() => {
  localStorage.clear()
  rememberReturn(EVENT)
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe("esborrar la ruta desada en entrar fora de l'Inici", () => {
  it("entrant ja a la fitxa, l'esborra", () => {
    window.history.replaceState(null, '', EVENT)
    renderHook(() => useForgetReturn('u1'))
    expect(takeReturn()).toBeNull()
  })

  it("entrant a l'Inici, que és el retorn de Google, la deixa", () => {
    renderHook(() => useForgetReturn('u1'))
    expect(takeReturn()).toBe(EVENT)
  })

  it('sense sessió no toca res', () => {
    window.history.replaceState(null, '', EVENT)
    renderHook(() => useForgetReturn(null))
    expect(takeReturn()).toBe(EVENT)
  })
})
