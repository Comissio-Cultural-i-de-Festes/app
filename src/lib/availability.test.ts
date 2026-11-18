import { describe, expect, it } from 'vitest'

import { type QueryState, availabilityKey, availabilityOf, isWaiting } from './availability'

/**
 * Els quatre «no hi ha res a ensenyar», cadascun amb la seva frase.
 *
 * El que aquí es fixa és el que trencava les pantalles: una consulta en pausa
 * sense dades no és «carregant».
 */

const q = (over: Partial<QueryState>): QueryState => ({
  data: undefined,
  status: 'pending',
  fetchStatus: 'fetching',
  ...over,
})

describe('availabilityOf', () => {
  it('una consulta en pausa sense dades és «sense xarxa», no «carregant»', () => {
    expect(availabilityOf([q({ fetchStatus: 'paused' })], false)).toBe('offline')
  })

  it('una pausa amb dades a la cau ensenya les dades', () => {
    expect(availabilityOf([q({ data: [], status: 'success', fetchStatus: 'paused' })], false)).toBe(
      'ready',
    )
  })

  it('carregant fins que el rellotge diu que la xarxa no contesta', () => {
    expect(availabilityOf([q({})], false)).toBe('loading')
    expect(availabilityOf([q({})], true)).toBe('stalled')
  })

  it('el rellotge no compta quan ja hi ha dades', () => {
    expect(availabilityOf([q({ data: 1, status: 'success' })], true)).toBe('ready')
  })

  it("l'error va davant de tot, també de les dades", () => {
    expect(availabilityOf([q({ status: 'error', fetchStatus: 'idle' })], true)).toBe('failed')
    expect(availabilityOf([q({ data: [], status: 'error', fetchStatus: 'idle' })], false)).toBe(
      'failed',
    )
  })

  it("obrint l'app ja sense xarxa, la petició a l'aire també és «sense xarxa»", () => {
    expect(availabilityOf([q({})], false, false)).toBe('offline')
    expect(availabilityOf([q({ data: 1, status: 'success' })], false, false)).toBe('ready')
  })

  it('una consulta desactivada sense dades no és cap error', () => {
    expect(availabilityOf([q({ fetchStatus: 'idle' })], true)).toBe('loading')
  })

  it('amb dues, només és a punt quan hi són totes dues', () => {
    const done = q({ data: [], status: 'success', fetchStatus: 'idle' })
    expect(availabilityOf([done, q({ fetchStatus: 'paused' })], false)).toBe('offline')
    expect(availabilityOf([done, q({})], true)).toBe('stalled')
    expect(availabilityOf([done, done], true)).toBe('ready')
  })

  it('null és una resposta: «no existeix» no és «no ha arribat»', () => {
    expect(availabilityOf([q({ data: null, status: 'success', fetchStatus: 'idle' })], true)).toBe(
      'ready',
    )
  })
})

describe('isWaiting', () => {
  it('només quan falten dades i hi ha una petició a l’aire', () => {
    expect(isWaiting([q({})])).toBe(true)
    expect(isWaiting([q({ fetchStatus: 'paused' })])).toBe(false)
    expect(isWaiting([q({ data: 1, status: 'success' })])).toBe(false)
  })
})

describe('availabilityKey', () => {
  it('cada estat la seva frase', () => {
    expect(availabilityKey('offline', null, true)).toBe('errors.offline')
    expect(availabilityKey('stalled', null, true)).toBe('errors.stalled')
    expect(availabilityKey('failed', new Error('x'), false)).toBe('errors.offline')
    expect(availabilityKey('failed', new Error('x'), true)).toBe('errors.network')
  })
})
