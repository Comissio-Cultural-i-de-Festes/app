import { describe, expect, it } from 'vitest'

import { fromLocalInput, toLocalInput } from './eventFormApi'

/**
 * The two functions between a `datetime-local` input and a `timestamptz`.
 *
 * The input has no concept of a time zone: it shows and returns wall-clock
 * text. Get this wrong and a committee in Mataró sees every start time two
 * hours out all summer, "corrects" it, and the correction is what ships.
 */

const TZ = 'Europe/Madrid'

describe('the event form clock', () => {
  it('shows a summer evening at the hour it actually starts', () => {
    // 21:00 in Madrid in September is 19:00 UTC.
    expect(toLocalInput('2026-09-19T19:00:00.000Z', TZ)).toBe('2026-09-19T21:00')
  })

  it('and a winter one, an hour closer to UTC', () => {
    expect(toLocalInput('2026-12-19T20:00:00.000Z', TZ)).toBe('2026-12-19T21:00')
  })

  it('turns what was typed back into the right instant, in summer', () => {
    expect(fromLocalInput('2026-09-19T21:00', TZ)).toBe('2026-09-19T19:00:00.000Z')
  })

  it('and in winter', () => {
    expect(fromLocalInput('2026-12-19T21:00', TZ)).toBe('2026-12-19T20:00:00.000Z')
  })

  it('round-trips whatever it is given', () => {
    for (const iso of [
      '2026-01-01T23:30:00.000Z',
      '2026-06-21T00:15:00.000Z',
      '2026-10-24T22:00:00.000Z',
      '2027-03-27T23:59:00.000Z',
    ]) {
      expect(fromLocalInput(toLocalInput(iso, TZ), TZ)).toBe(iso)
    }
  })

  it('treats an empty field as no date rather than as the epoch', () => {
    expect(toLocalInput(null, TZ)).toBe('')
    expect(fromLocalInput('', TZ)).toBeNull()
  })

  it('refuses nonsense instead of inventing a date', () => {
    expect(fromLocalInput('not a date', TZ)).toBeNull()
  })
})
