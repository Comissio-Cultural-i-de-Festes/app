import { beforeEach, describe, expect, it } from 'vitest'

import { ackStreakBreak, type Streak, streakIsAtStake, streakShape, wasAcked } from './streak'

const BASE: Streak = {
  actual: 0,
  millor: 0,
  perduda: 0,
  trencada_el: null,
  compten: 0,
  hi_has_anat: 0,
}

const DESEMBRE = '2026-12-18T22:00:00+00:00'
const MARC = '2027-03-04T21:00:00+00:00'

beforeEach(() => {
  localStorage.clear()
})

describe('quin dels quatre dibuixos toca', () => {
  it('amb zero i sense res trencat, cap ratxa', () => {
    expect(streakShape(BASE)).toBe('cap')
  })

  it('amb una en diu una, perquè «1 activitats seguides» no ho diu ningú', () => {
    expect(streakShape({ ...BASE, actual: 1, millor: 12 })).toBe('una')
  })

  it('i a partir de dues, moltes', () => {
    expect(streakShape({ ...BASE, actual: 2, millor: 12 })).toBe('moltes')
    expect(streakShape({ ...BASE, actual: 14, millor: 14 })).toBe('moltes')
  })

  it('amb zero i alguna cosa trencada, l’avís', () => {
    expect(streakShape({ ...BASE, perduda: 9, millor: 9, trencada_el: DESEMBRE })).toBe('trencada')
  })

  // El cas que fa que la pantalla no renyi i feliciti alhora. El servidor ja
  // posa `perduda` a zero quan n'hi ha una de viva, i això ho torna a dir aquí
  // perquè la pantalla no depengui d'haver-ho recordat.
  it('no ensenya mai una ratxa trencada mentre n’hi ha una de viva', () => {
    expect(streakShape({ ...BASE, actual: 3, perduda: 9, trencada_el: DESEMBRE })).toBe('moltes')
  })
})

describe('«Entesos»', () => {
  it('fa marxar l’avís i deixa el zero a sota', () => {
    const trencada: Streak = { ...BASE, perduda: 9, millor: 9, trencada_el: DESEMBRE }
    expect(streakShape(trencada)).toBe('trencada')

    ackStreakBreak(DESEMBRE)

    expect(wasAcked(DESEMBRE)).toBe(true)
    expect(streakShape(trencada)).toBe('cap')
  })

  // Una sola bandera faria que qui tanca l'avís del desembre no vegi mai més el
  // del març, que és exactament quan tornaria a servir d'alguna cosa.
  it('no fa marxar el de la pròxima vegada', () => {
    ackStreakBreak(DESEMBRE)
    expect(streakShape({ ...BASE, perduda: 4, millor: 9, trencada_el: MARC })).toBe('trencada')
  })

  it('ensenya l’avís en comptes d’amagar-lo quan no es pot llegir res', () => {
    localStorage.setItem('comi.streak.ack', 'això no és json')
    expect(streakShape({ ...BASE, perduda: 9, trencada_el: DESEMBRE })).toBe('trencada')
  })
})

describe('quan la ratxa hi compta, a l’esdeveniment', () => {
  it('només amb una de viva', () => {
    expect(streakIsAtStake({ ...BASE, actual: 7 })).toBe(true)
    // Demanar-li una ratxa a qui no ha vingut mai és demanar-li una cosa que
    // encara no vol.
    expect(streakIsAtStake({ ...BASE, actual: 0 })).toBe(false)
    expect(streakIsAtStake(undefined)).toBe(false)
  })
})
