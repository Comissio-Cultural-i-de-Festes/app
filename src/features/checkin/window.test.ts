import { describe, expect, it } from 'vitest'

import { CLOSES_AFTER_MS, OPENS_BEFORE_MS, checkinWindow, isOpen } from './window'

/**
 * The check-in window, pinned to the rule the server actually enforces.
 *
 * This module's own comment says the rule exists twice and both copies have to
 * agree, and that if they diverge the symptom is a button that is there and
 * answers «tancat». It had no test, which is the half of that sentence nothing
 * was keeping.
 *
 * The rule on the server, from migration 36 — quoted so a divergence is
 * visible here rather than on the night of a party:
 *
 *   select tsrange(
 *     (e.starts_at - interval '1 hour') at time zone 'UTC',
 *     (coalesce(d.ends_at, e.starts_at + interval '6 hours') + interval '1 hour')
 *       at time zone 'UTC'
 *   )
 *
 * Three things follow, and all three are asserted below: one hour either side,
 * six hours of assumed duration when there is no end, and `tsrange`'s default
 * `[)` bounds — inclusive at the start, exclusive at the end.
 */

const HOUR = 3_600_000
const T = (iso: string): number => new Date(iso).getTime()

describe('checkinWindow', () => {
  it('is the same hour either side that the SQL uses', () => {
    expect(OPENS_BEFORE_MS).toBe(HOUR)
    expect(CLOSES_AFTER_MS).toBe(HOUR)
  })

  it('opens an hour before the start and closes an hour after the end', () => {
    const w = checkinWindow('2026-09-04T22:00:00Z', '2026-09-05T03:00:00Z')

    expect(w.opens).toBe(T('2026-09-04T21:00:00Z'))
    expect(w.closes).toBe(T('2026-09-05T04:00:00Z'))
  })

  it('assumes six hours when there is no end, like coalesce does', () => {
    const w = checkinWindow('2026-09-04T22:00:00Z', null)

    // 22:00 + 6h = 04:00, and then the hour after.
    expect(w.closes).toBe(T('2026-09-05T05:00:00Z'))
    expect(w.closes - T('2026-09-04T22:00:00Z')).toBe(7 * HOUR)
  })

  it('reads an end before the start literally, without repairing it', () => {
    // The form can save this — `endsBad` in EventFormScreen only warns — and
    // the arithmetic then yields a window that never opens. Here the two hours
    // cancel exactly (22:00 - 1h == 20:00 + 1h), so with `[)` bounds there is
    // no instant inside it at all. The client has to agree with the server
    // rather than quietly swapping the two dates.
    const w = checkinWindow('2026-09-04T22:00:00Z', '2026-09-04T20:00:00Z')

    expect(w.closes).toBe(w.opens)
    expect(isOpen(w, w.opens)).toBe(false)
    expect(isOpen(w, T('2026-09-04T21:30:00Z'))).toBe(false)
    expect(isOpen(w, T('2026-09-04T20:30:00Z'))).toBe(false)
  })
})

describe('isOpen', () => {
  const w = checkinWindow('2026-09-04T22:00:00Z', '2026-09-05T03:00:00Z')

  it('is shut before it opens and open once it does', () => {
    expect(isOpen(w, w.opens - 1)).toBe(false)
    expect(isOpen(w, w.opens)).toBe(true)
  })

  /**
   * The boundary that matters, and the reason it is asserted twice.
   *
   * `tsrange` is `[)` unless told otherwise, so the closing instant is OUTSIDE
   * the window on the server. `isOpen` uses `now < w.closes`, which agrees.
   * Flipping that one character to `<=` would give the last hour of every
   * party a button that the server refuses, and nothing else in the suite
   * would notice.
   */
  it('is open the millisecond before it closes and shut on the instant', () => {
    expect(isOpen(w, w.closes - 1)).toBe(true)
    expect(isOpen(w, w.closes)).toBe(false)
  })

  it('is shut long after', () => {
    expect(isOpen(w, w.closes + HOUR)).toBe(false)
  })

  it('is open in the middle, which is the case that must not regress', () => {
    expect(isOpen(w, T('2026-09-05T00:30:00Z'))).toBe(true)
  })
})

/**
 * Daylight saving.
 *
 * The window is arithmetic on epoch milliseconds, so a party that straddles
 * the October change is five wall-clock hours and six real ones. This is the
 * behaviour the server has too — it does the same interval arithmetic on
 * `timestamptz` — and it is worth pinning because the obvious "fix" of working
 * in local time would make the two disagree.
 */
describe('across the October clock change', () => {
  it('counts real hours, not clock hours', () => {
    // Europe/Madrid goes 03:00 -> 02:00 on 2026-10-25.
    const w = checkinWindow('2026-10-25T00:00:00Z', '2026-10-25T04:00:00Z')

    expect(w.closes - w.opens).toBe(6 * HOUR)
    expect(isOpen(w, T('2026-10-25T01:30:00Z'))).toBe(true)
  })
})
