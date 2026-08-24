import { ExitPhotoCard, PreviewQuery } from 'app-comi'

/**
 * The card reads one query — `['photos','nights']` — and renders nothing
 * unless a matching night comes back with no exit photograph on it. Seeding
 * that key is what makes it visible; it never fetches in a preview.
 */
const HOURS = 3_600_000

/**
 * `ends_at` is relative to now on purpose: the card's rule is that it appears
 * only in the 36 hours after the event ended, so a fixed date would put the
 * preview outside its own window the day after it was written.
 */
function lastNight() {
  return {
    id: 'ev-1',
    titulo: 'Sopar de tardor',
    starts_at: new Date(Date.now() - 12 * HOURS).toISOString(),
    ends_at: new Date(Date.now() - 6 * HOURS).toISOString(),
  } as never
}

const NIGHT = {
  event_id: 'ev-1',
  titulo: 'Sopar de tardor',
  starts_at: new Date(Date.now() - 12 * HOURS).toISOString(),
  entry_photo_url: 'door/ev-1/me.jpg',
  exit_photo_url: null,
  // A fixed clock time, so the rendered card does not drift between captures.
  checked_in_at: '2026-08-23T21:14:00.000Z',
  exit_photo_at: null,
}

/** The morning after: you were at the door last night, and owe yourself one. */
export function TheMorningAfter() {
  return (
    <PreviewQuery seed={[[['photos', 'nights'], [NIGHT]]]}>
      <div className="w-[358px]">
        <ExitPhotoCard event={lastNight()} />
      </div>
    </PreviewQuery>
  )
}

/**
 * With no check-in time recorded the copy changes: it names the event instead
 * of the hour. Same card, the other half of its only conditional.
 */
export function WithoutACheckInTime() {
  return (
    <PreviewQuery seed={[[['photos', 'nights'], [{ ...NIGHT, checked_in_at: null }]]]}>
      <div className="w-[358px]">
        <ExitPhotoCard event={lastNight()} />
      </div>
    </PreviewQuery>
  )
}
