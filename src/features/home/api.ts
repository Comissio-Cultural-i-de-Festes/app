import { zonedDayStart } from '@/i18n/format'
import type { Answer, AttendanceState } from '@/lib/model'
import type { AttendanceTable, EventRow } from '@/lib/schema'
import { unwrap, unwrapAs } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * What the home screen reads.
 *
 * One row of `events_public` is a whole event: the always-public half plus the
 * detail columns, which come back NULL until reveal_at because the child row
 * is filtered out by its own policy. There is no branching here on whether
 * something is revealed — `revelat` says so, and the missing fields are simply
 * missing.
 */

export type { EventRow }

/**
 * An answer, with the name and face attached.
 *
 * `profiles` is an object rather than an array: attendances.user_id is a
 * foreign key onto a primary key, so PostgREST resolves the embed as
 * many-to-one. It is still nullable, because a profile row can be deleted out
 * from under an attendance the junta has not tidied up yet.
 *
 * The embed has to name its foreign key. `attendances` points at `profiles`
 * twice — once for whose answer it is and once for which admin scanned them —
 * and an unqualified `profiles(...)` is rejected with PGRST201 rather than
 * guessing. That failure is invisible from SQL and only shows up over HTTP,
 * which is why tests/rls/screens.test.ts pins it.
 */
export type AttendanceRow = Pick<AttendanceTable, 'user_id' | 'event_id' | 'created_at'> & {
  readonly estado: AttendanceState
  readonly profiles: { readonly nombre: string; readonly avatar_url: string | null } | null
}

const EVENT_COLUMNS =
  'id, titulo, tipo, starts_at, teaser, reveal_at, revelat, plazas, ' +
  'precio_cents, puntos, descripcion, ubicacion, ends_at, cover_url'

const HOUR_MS = 3_600_000

/**
 * An event stays "next" for six hours after it starts.
 *
 * Otherwise the party you are standing at disappears from the home screen
 * halfway through it and is replaced by whatever comes in October, which is
 * the one moment the app is most likely to be open. Rounded to the hour so the
 * boundary is a stable cache key rather than a new one every render.
 */
export const IN_PROGRESS_MS = 6 * HOUR_MS

export function horizonIso(now: number = Date.now()): string {
  return new Date(Math.floor((now - IN_PROGRESS_MS) / HOUR_MS) * HOUR_MS).toISOString()
}

export const homeKeys = {
  upcoming: (horizon: string) => ['home', 'upcoming', horizon] as const,
  previous: (horizon: string) => ['home', 'previous', horizon] as const,
  attendances: (eventIds: readonly string[]) => ['home', 'attendances', ...eventIds] as const,
}

/** The hero plus the "què més ve" list, in one request. */
export async function fetchUpcoming(horizon: string, limit = 6): Promise<EventRow[]> {
  return unwrapAs<EventRow[]>(
    supabase
      .from('events_public')
      .select(EVENT_COLUMNS)
      .eq('published', true)
      .gte('starts_at', horizon)
      .order('starts_at', { ascending: true })
      .limit(limit),
  )
}

/** The most recent thing that has already happened, for "l'última vegada". */
export async function fetchPrevious(horizon: string): Promise<EventRow[]> {
  return unwrapAs<EventRow[]>(
    supabase
      .from('events_public')
      .select(EVENT_COLUMNS)
      .eq('published', true)
      .lt('starts_at', horizon)
      .order('starts_at', { ascending: false })
      .limit(1),
  )
}

/**
 * Answers for the events on screen.
 *
 * RLS decides what comes back: every 'si' and 'asistio' from anyone, plus all
 * of your own rows whatever they say. So the counts here are the real public
 * counts, and 'potser' and 'no' are only ever your own.
 */
export async function fetchAttendances(eventIds: readonly string[]): Promise<AttendanceRow[]> {
  if (eventIds.length === 0) return []
  return unwrapAs<AttendanceRow[]>(
    supabase
      .from('attendances')
      .select(
        'user_id, event_id, estado, created_at, ' +
          'profiles!attendances_user_id_fkey(nombre, avatar_url)',
      )
      .in('event_id', [...eventIds])
      .order('created_at', { ascending: false }),
  )
}

export async function setAnswer(userId: string, eventId: string, estado: Answer): Promise<void> {
  await unwrap(
    supabase
      .from('attendances')
      .upsert({ user_id: userId, event_id: eventId, estado }, { onConflict: 'user_id,event_id' })
      .select('event_id'),
  )
}

// ── derived, and tested on its own ──────────────────────────────────────────

/** Everyone publicly counted as coming: said yes, or already came through the door. */
export function goingRows(rows: readonly AttendanceRow[], eventId: string): AttendanceRow[] {
  return rows.filter((r) => r.event_id === eventId && (r.estado === 'si' || r.estado === 'asistio'))
}

export function myAnswer(
  rows: readonly AttendanceRow[],
  eventId: string,
  userId: string,
): AttendanceState | null {
  return rows.find((r) => r.event_id === eventId && r.user_id === userId)?.estado ?? null
}

/**
 * Places still free, or null when the event has no limit.
 *
 * Never negative: a walk-in checked in at the door pushes the count past the
 * cap legitimately, and "queden -2 places" is not a thing to show anybody.
 */
export function placesLeft(event: EventRow, going: number): number | null {
  if (event.plazas === null) return null
  return Math.max(0, event.plazas - going)
}

/**
 * The names behind "en Marc, la Júlia i 3 més s'han apuntat avui".
 *
 * Yours is excluded — you know you signed up, and the line exists to show
 * movement by other people.
 *
 * "Today" is the same calendar day in the association's zone, compared day
 * index to day index. Comparing against a midnight computed as an instant is
 * the version that quietly loses everything signed up between midnight and two
 * in the morning, which at this association is not an edge case.
 */
export function signedUpToday(
  rows: readonly AttendanceRow[],
  eventId: string,
  userId: string,
  now: Date,
): string[] {
  const today = zonedDayStart(now)
  return goingRows(rows, eventId)
    .filter((r) => r.user_id !== userId && zonedDayStart(new Date(r.created_at)) === today)
    .map((r) => r.profiles?.nombre)
    .filter((n): n is string => typeof n === 'string' && n !== '')
}
