import { describe, expect, it } from 'vitest'

import { SWEEP_EVERY_MS, byBucket, sweepDue } from './sweep'

const NOW = 1_800_000_000_000

describe('sweepDue', () => {
  it('el primer cop, sí', () => {
    expect(sweepDue(null, NOW)).toBe(true)
  })

  it('si fa menys d’un dia, no', () => {
    expect(sweepDue(String(NOW - SWEEP_EVERY_MS + 1), NOW)).toBe(false)
  })

  it('passat un dia, sí', () => {
    expect(sweepDue(String(NOW - SWEEP_EVERY_MS), NOW)).toBe(true)
  })

  it('una marca il·legible o del futur no el bloqueja per sempre', () => {
    expect(sweepDue('ahir', NOW)).toBe(true)
    expect(sweepDue(String(NOW + 60_000), NOW)).toBe(true)
  })
})

describe('byBucket', () => {
  it('agrupa per bucket, en l’ordre que arriben', () => {
    const grouped = byBucket([
      { bucket: 'avatars', path: 'u/1.jpg' },
      { bucket: 'event-covers', path: 'e/1.jpg' },
      { bucket: 'avatars', path: 'u/2.jpg' },
    ])
    expect([...grouped.entries()]).toEqual([
      ['avatars', ['u/1.jpg', 'u/2.jpg']],
      ['event-covers', ['e/1.jpg']],
    ])
  })

  it('res, res', () => {
    expect(byBucket([]).size).toBe(0)
  })
})
