import { describe, expect, it } from 'vitest'

import { type EventSummary, emptySummary, isGoing, signedUpToday, summaryOf } from './summary'

function summary(over: Partial<EventSummary> = {}): EventSummary {
  return { ...emptySummary('e1'), ...over }
}

describe('summaryOf', () => {
  it('troba el de l’esdeveniment', () => {
    const mine = summary({ going: 3 })
    expect(summaryOf([summary({ event_id: 'e2' }), mine], 'e1')).toBe(mine)
  })

  it('sense dades és un de buit, a zero i sense resposta', () => {
    expect(summaryOf([], 'e9')).toEqual({
      event_id: 'e9',
      going: 0,
      attended: 0,
      mine: null,
      mine_at: null,
      faces: [],
      recent: [],
    })
  })
})

describe('who counts as coming', () => {
  it('counts the yeses and the people already through the door', () => {
    expect(isGoing('si')).toBe(true)
    expect(isGoing('asistio')).toBe(true)
    expect(isGoing('potser')).toBe(false)
    expect(isGoing('espera')).toBe(false)
    expect(isGoing(null)).toBe(false)
  })
})

describe('the movement line', () => {
  const now = new Date('2026-09-20T11:30:00Z')

  it('names the people who signed up today, and not yesterday', () => {
    const s = summary({
      recent: [
        { nombre: 'Alfa Bravo', created_at: '2026-09-20T09:00:00Z' },
        { nombre: 'Charlie Delta', created_at: '2026-09-19T09:00:00Z' },
      ],
    })
    expect(signedUpToday(s, now)).toEqual(['Alfa Bravo'])
  })

  it('counts somebody who signed up at half past midnight', () => {
    // 22:30Z is already 00:30 the next day in Madrid. Measuring "today" from an
    // instant computed as UTC midnight drops exactly this person, and the line
    // goes missing on the nights it has the most to say.
    const s = summary({ recent: [{ nombre: 'Alfa Bravo', created_at: '2026-09-19T22:30:00Z' }] })
    expect(signedUpToday(s, now)).toEqual(['Alfa Bravo'])
  })

  it('reads the timestamps the way Postgres writes them inside JSON', () => {
    const s = summary({
      recent: [{ nombre: 'Alfa Bravo', created_at: '2026-09-20T09:00:00.123456+00:00' }],
    })
    expect(signedUpToday(s, now)).toEqual(['Alfa Bravo'])
  })

  it('is empty when nobody moved', () => {
    expect(signedUpToday(summary(), now)).toEqual([])
  })
})
