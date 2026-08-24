/**
 * When the "you still owe yourself a photograph" card is on the home screen.
 *
 * Two rules, both from the drawings. It appears once the event is over — never
 * during it, and never before — and it goes away by the following night. The
 * button on the past event's own page is the permanent one; this is the nudge,
 * and a nudge that stays for ever is not a nudge.
 *
 * The window is 36 hours from the end of the event rather than "the end of the
 * next calendar day in the association's timezone", which is what the copy
 * literally promises. The difference is a few hours at the edge of a card
 * nobody is timing, and the honest version needs timezone-aware date
 * arithmetic that this app has no library for. Written down rather than hidden:
 * a party that ends at four on Saturday morning has its card until Sunday
 * afternoon, and «es tanca aquesta nit» is true when it is read on Saturday.
 */

const KEY = 'comi.exitPhoto.dismissed'

const HOUR_MS = 3_600_000
export const CARD_WINDOW_MS = 36 * HOUR_MS

function readDismissed(): readonly string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    // Private mode, blocked storage, or something else's data under our key.
    // Failing open shows the card, which is the harmless direction.
    return []
  }
}

/** "Ara no", remembered per event: dismissing one must not dismiss the next. */
export function dismissExitCard(eventId: string): void {
  try {
    const kept = [...new Set([...readDismissed(), eventId])].slice(-20)
    localStorage.setItem(KEY, JSON.stringify(kept))
  } catch {
    // Nothing to do. The card comes back, and the window closes anyway.
  }
}

export function wasDismissed(eventId: string): boolean {
  return readDismissed().includes(eventId)
}

/**
 * Whether this night's card belongs on the home screen.
 *
 * `endedAt` is the event's own end, not the moment it started: a card that
 * says "ahir a la nit" while the party is still going is a lie told to
 * somebody who is standing in it.
 */
export function shouldOfferExitPhoto(
  endedAt: Date,
  hasExitPhoto: boolean,
  eventId: string,
  now = Date.now(),
): boolean {
  if (hasExitPhoto) return false
  if (wasDismissed(eventId)) return false
  const ended = endedAt.getTime()
  return now >= ended && now < ended + CARD_WINDOW_MS
}
