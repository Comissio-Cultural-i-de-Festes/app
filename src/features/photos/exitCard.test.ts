import { beforeEach, describe, expect, it } from 'vitest'

import { CARD_WINDOW_MS, dismissExitCard, shouldOfferExitPhoto, wasDismissed } from './exitCard'

const ENDED = new Date('2026-09-12T02:00:00Z')
const AT_END = ENDED.getTime()
const EV = '00000000-0000-4000-8000-0000000000e1'
const OTHER = '00000000-0000-4000-8000-0000000000e2'

beforeEach(() => {
  localStorage.clear()
})

describe('when the home screen offers the exit photograph', () => {
  it('waits until the party is over', () => {
    // The case worth pinning: a card saying "ahir a la nit" shown to somebody
    // who is still standing in the party.
    expect(shouldOfferExitPhoto(ENDED, false, EV, AT_END - 60_000)).toBe(false)
    expect(shouldOfferExitPhoto(ENDED, false, EV, AT_END)).toBe(true)
  })

  it('is gone by the following night', () => {
    expect(shouldOfferExitPhoto(ENDED, false, EV, AT_END + CARD_WINDOW_MS - 1)).toBe(true)
    expect(shouldOfferExitPhoto(ENDED, false, EV, AT_END + CARD_WINDOW_MS)).toBe(false)
  })

  it('does not ask for one that is already taken', () => {
    expect(shouldOfferExitPhoto(ENDED, true, EV, AT_END + 3_600_000)).toBe(false)
  })

  it('remembers "ara no" per event and not for everything', () => {
    dismissExitCard(EV)
    expect(wasDismissed(EV)).toBe(true)
    expect(shouldOfferExitPhoto(ENDED, false, EV, AT_END + 3_600_000)).toBe(false)
    // The next party has to be able to ask again.
    expect(shouldOfferExitPhoto(ENDED, false, OTHER, AT_END + 3_600_000)).toBe(true)
  })

  it('shows the card rather than hiding it when storage is unreadable', () => {
    localStorage.setItem('comi.exitPhoto.dismissed', 'not json at all')
    expect(shouldOfferExitPhoto(ENDED, false, EV, AT_END + 3_600_000)).toBe(true)
  })
})
