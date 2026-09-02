import { describe, expect, it } from 'vitest'

import type { EventRow } from '@/lib/schema'

import {
  type AttendanceRow,
  IN_PROGRESS_MS,
  goingRows,
  horizonIso,
  myAnswer,
  placesLeft,
  signedUpToday,
} from './api'

const EVENT = 'e1'
const OTHER = 'e2'
const ME = 'me'

function event(over: Partial<EventRow> = {}): EventRow {
  return {
    id: EVENT,
    titulo: 'Alfa',
    tipo: 'fiesta',
    starts_at: '2026-09-25T19:00:00Z',
    teaser: null,
    reveal_at: null,
    revelat: true,
    cal_confirmacio: false,
    te_cotxes: false,
    plazas: null,
    precio_cents: 0,
    puntos: 10,
    published: true,
    created_by: null,
    created_at: null,
    descripcion: null,
    ubicacion: null,
    ends_at: null,
    cover_url: null,
    transport_info: null,
    abast: 'comi',
    tancada_at: null,
    acta: null,
    ...over,
  }
}

function answer(over: Partial<AttendanceRow> & { user_id: string }): AttendanceRow {
  return {
    event_id: EVENT,
    estado: 'si',
    created_at: '2026-09-20T10:00:00Z',
    profiles: { nombre: 'Alfa Bravo', avatar_url: null },
    ...over,
  }
}

describe('who counts as coming', () => {
  it('counts the yeses and the people already through the door', () => {
    const rows = [
      answer({ user_id: 'a', estado: 'si' }),
      answer({ user_id: 'b', estado: 'asistio' }),
      answer({ user_id: 'c', estado: 'potser' }),
      answer({ user_id: 'd', estado: 'no' }),
    ]
    expect(goingRows(rows, EVENT).map((r) => r.user_id)).toEqual(['a', 'b'])
  })

  it('keeps the events apart', () => {
    const rows = [answer({ user_id: 'a' }), answer({ user_id: 'b', event_id: OTHER })]
    expect(goingRows(rows, EVENT)).toHaveLength(1)
  })

  it('reads your own answer, including the ones nobody else can see', () => {
    const rows = [answer({ user_id: ME, estado: 'potser' }), answer({ user_id: 'a' })]
    expect(myAnswer(rows, EVENT, ME)).toBe('potser')
    expect(myAnswer(rows, OTHER, ME)).toBeNull()
  })
})

describe('places left', () => {
  it('is nothing at all when the event has no limit', () => {
    expect(placesLeft(event({ plazas: null }), 40)).toBeNull()
  })

  it('subtracts the people coming from the cap', () => {
    expect(placesLeft(event({ plazas: 30 }), 8)).toBe(22)
  })

  it('never goes below zero, because a walk-in can push past the cap', () => {
    // Somebody scanned at the door who was not on the list is a legitimate
    // thirty-first attendee. "Queden -1 places" is not a thing to show anybody.
    expect(placesLeft(event({ plazas: 30 }), 31)).toBe(0)
  })
})

describe('the movement line', () => {
  const now = new Date('2026-09-20T11:30:00Z')

  it('names the people who signed up today, and not you', () => {
    const rows = [
      answer({ user_id: 'a', created_at: '2026-09-20T09:00:00Z' }),
      answer({ user_id: ME, created_at: '2026-09-20T10:00:00Z' }),
      answer({ user_id: 'b', created_at: '2026-09-19T09:00:00Z' }),
    ]
    expect(signedUpToday(rows, EVENT, ME, now)).toEqual(['Alfa Bravo'])
  })

  it('counts somebody who signed up at half past midnight', () => {
    // 22:30Z is already 00:30 the next day in Madrid. Measuring "today" from an
    // instant computed as UTC midnight drops exactly this person, and the line
    // goes missing on the nights it has the most to say.
    const rows = [answer({ user_id: 'a', created_at: '2026-09-19T22:30:00Z' })]
    expect(signedUpToday(rows, EVENT, ME, now)).toEqual(['Alfa Bravo'])
  })

  it('ignores maybes, which are not movement', () => {
    const rows = [answer({ user_id: 'a', estado: 'potser', created_at: '2026-09-20T09:00:00Z' })]
    expect(signedUpToday(rows, EVENT, ME, now)).toEqual([])
  })

  it('drops a row whose profile is gone rather than rendering a blank name', () => {
    const rows = [
      answer({ user_id: 'a', created_at: '2026-09-20T09:00:00Z', profiles: null }),
      answer({ user_id: 'b', created_at: '2026-09-20T09:00:00Z' }),
    ]
    expect(signedUpToday(rows, EVENT, ME, now)).toEqual(['Alfa Bravo'])
  })
})

describe('the horizon', () => {
  const noon = Date.UTC(2026, 8, 25, 12, 34, 56)

  it('keeps an event that started a couple of hours ago on the screen', () => {
    expect(Date.parse(horizonIso(noon))).toBeLessThan(noon - 2 * 3_600_000)
  })

  it('lets go of one that finished this morning', () => {
    expect(Date.parse(horizonIso(noon))).toBeGreaterThan(noon - IN_PROGRESS_MS - 3_600_000)
  })

  it('lands on the hour, so it is a stable cache key', () => {
    // A boundary that moves every millisecond is a new query key on every
    // render, which is a request per render.
    expect(horizonIso(noon)).toBe(horizonIso(noon + 60_000))
    expect(Date.parse(horizonIso(noon)) % 3_600_000).toBe(0)
  })
})
