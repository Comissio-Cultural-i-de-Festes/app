import { describe, expect, it } from 'vitest'

import {
  type Period,
  type RankingRow,
  periodBounds,
  periodIsCurrent,
  positionDeltas,
  weekAgoIso,
} from './api'

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0)

function period(over: Partial<Period> = {}): Period {
  return { codi: 't1', etiqueta: null, starts_at: null, ends_at: null, ordre: 1, ...over }
}

function row(user_id: string, posicio: number): RankingRow {
  return { user_id, nombre: user_id, avatar_url: null, escola: null, punts: 0, posicio }
}

describe('period bounds', () => {
  it('treats no period as the whole ledger', () => {
    expect(periodBounds(null)).toEqual({ from: null, to: null })
  })

  it('passes an open end through as open', () => {
    const p = period({ starts_at: '2026-09-01T00:00:00Z', ends_at: null })
    expect(periodBounds(p)).toEqual({ from: '2026-09-01T00:00:00Z', to: null })
  })
})

describe('whether "this week" means anything', () => {
  it('does for a term that is running', () => {
    const p = period({ starts_at: '2026-09-01T00:00:00Z', ends_at: '2027-01-01T00:00:00Z' })
    expect(periodIsCurrent(p, NOW)).toBe(true)
  })

  it('does not for one that has ended', () => {
    // Telling somebody how far they moved last week inside a term that
    // finished in June is not a smaller truth, it is a wrong one.
    const p = period({ starts_at: '2026-01-01T00:00:00Z', ends_at: '2026-06-01T00:00:00Z' })
    expect(periodIsCurrent(p, NOW)).toBe(false)
  })

  it('does not for one that has not started', () => {
    const p = period({ starts_at: '2027-04-01T00:00:00Z', ends_at: '2027-08-01T00:00:00Z' })
    expect(periodIsCurrent(p, NOW)).toBe(false)
  })

  it('does for the whole course, which has no end', () => {
    expect(periodIsCurrent(period({ starts_at: '2026-09-01T00:00:00Z' }), NOW)).toBe(true)
  })
})

describe('a week ago', () => {
  it('is seven days back, on the hour', () => {
    const iso = weekAgoIso(NOW)
    expect(Date.parse(iso)).toBe(NOW - 7 * 86_400_000)
  })

  it('does not move between renders within the hour', () => {
    expect(weekAgoIso(NOW)).toBe(weekAgoIso(NOW + 59 * 60_000))
  })
})

describe('how far people moved', () => {
  it('is positive for going up the table', () => {
    // Position 9 last week, position 4 now: five places up, so the number the
    // arrow points at has to be positive.
    const deltas = positionDeltas([row('a', 4)], [row('a', 9)])
    expect(deltas.get('a')).toBe(5)
  })

  it('is negative for going down', () => {
    expect(positionDeltas([row('a', 11)], [row('a', 8)]).get('a')).toBe(-3)
  })

  it('says nothing about somebody who was not here last week', () => {
    // A new member has not moved, they have arrived. Treating a missing
    // previous position as zero would show every newcomer a green arrow the
    // size of the whole table.
    const deltas = positionDeltas([row('a', 4), row('new', 30)], [row('a', 9)])
    expect(deltas.has('new')).toBe(false)
  })

  it('ignores somebody who has since left', () => {
    expect([...positionDeltas([row('a', 1)], [row('a', 1), row('gone', 2)]).keys()]).toEqual(['a'])
  })
})
