import { DbError, unwrapAs } from '@/lib/db'
import type { EventType } from '@/lib/model'
import type { EventRow } from '@/lib/schema'
import { supabase } from '@/lib/supabase'

/**
 * Creating and editing an event.
 *
 * Everything goes through `admin_save_event`, which writes `events` and
 * `event_details` in one transaction. Two round trips could leave an event
 * whose detail row never arrived, and an absent detail row is exactly what a
 * reveal that has not happened yet looks like — the screen would look correct
 * and the location would be gone.
 */

export interface EventDraft {
  readonly id: string | null
  readonly titulo: string
  readonly tipo: EventType
  readonly starts_at: string
  readonly ends_at: string | null
  readonly plazas: number | null
  readonly precio_cents: number
  readonly puntos: number | null
  readonly teaser: string | null
  readonly reveal_at: string | null
  readonly published: boolean
  /** A yes on this one is a request the junta has to decide. */
  readonly cal_confirmacio: boolean
  readonly descripcion: string | null
  readonly ubicacion: string | null
  readonly cover_url: string | null
  readonly transport_info: string | null
}

export const eventFormKeys = {
  templates: () => ['junta', 'templates'] as const,
  memberCount: () => ['junta', 'memberCount'] as const,
  pointValues: () => ['junta', 'pointValues'] as const,
}

export async function saveEvent(draft: EventDraft): Promise<string> {
  const { data, error } = await supabase.rpc('admin_save_event', {
    p_titulo: draft.titulo,
    p_tipo: draft.tipo,
    p_starts_at: draft.starts_at,
    ...(draft.id === null ? {} : { p_id: draft.id }),
    ...(draft.plazas === null ? {} : { p_plazas: draft.plazas }),
    p_precio_cents: draft.precio_cents,
    ...(draft.puntos === null ? {} : { p_puntos: draft.puntos }),
    ...(draft.teaser === null ? {} : { p_teaser: draft.teaser }),
    ...(draft.reveal_at === null ? {} : { p_reveal_at: draft.reveal_at }),
    p_published: draft.published,
    p_cal_confirmacio: draft.cal_confirmacio,
    ...(draft.descripcion === null ? {} : { p_descripcion: draft.descripcion }),
    ...(draft.ubicacion === null ? {} : { p_ubicacion: draft.ubicacion }),
    ...(draft.ends_at === null ? {} : { p_ends_at: draft.ends_at }),
    ...(draft.cover_url === null ? {} : { p_cover_url: draft.cover_url }),
    ...(draft.transport_info === null ? {} : { p_transport_info: draft.transport_info }),
  })

  if (error) throw new DbError(error)
  return data
}

/**
 * Past events, to start from instead of from nothing.
 *
 * The brief asks for this by name: duplicating last year's is how a committee
 * that meets between lectures gets an event up in five minutes rather than
 * abandoning it half-written.
 */
export async function fetchTemplates(): Promise<EventRow[]> {
  return unwrapAs<EventRow[]>(
    supabase
      .from('events_public')
      .select(
        'id, titulo, tipo, starts_at, teaser, reveal_at, revelat, plazas, precio_cents, ' +
          'puntos, published, cal_confirmacio, descripcion, ubicacion, ends_at, cover_url, ' +
          'transport_info',
      )
      .order('starts_at', { ascending: false })
      .limit(8),
  )
}

/**
 * Puts an event on, or takes it off, every member's home screen.
 *
 * Its own RPC rather than a `published` flag on admin_save_event, for two
 * reasons: it is one tap from a screen that is not otherwise saving anything,
 * and it is the change most worth having in audit_log on its own line. The
 * direct UPDATE grant on `events` was revoked in the same migration, so this
 * is now the only way the column moves.
 */
export async function setPublished(eventId: string, published: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_published', {
    p_event_id: eventId,
    p_published: published,
  })
  if (error) throw new DbError(error)
}

/**
 * Removes an event that never happened.
 *
 * Refused by the database when the event has points on it — `points_log`'s
 * foreign key is ON DELETE SET NULL, so deleting one of those would keep
 * everybody's points and lose what they were for. That case comes back as
 * P0001 and the screen says to unpublish instead.
 */
export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_event', { p_event_id: eventId })
  if (error) throw new DbError(error)
}

/**
 * How many people would see it. The number is what makes the sentence land —
 * "no ho veu ningú" and "ho veuen 214 persones" are different decisions.
 */
export async function fetchMemberCount(): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('estat', 'actiu')
  if (error) throw new DbError(error)
  return count ?? 0
}

export interface PointValue {
  readonly mena: string
  readonly clau: string
  readonly punts: number
  readonly ordre: number
}

export async function fetchPointValues(): Promise<PointValue[]> {
  return unwrapAs<PointValue[]>(
    supabase.from('point_values').select('mena, clau, punts, ordre').order('ordre'),
  )
}

/**
 * A timestamp the `datetime-local` input can hold, in the association's zone.
 *
 * The input has no concept of a time zone: it shows and returns wall-clock
 * text. Feeding it a UTC string would show a committee in Mataró a start time
 * two hours out all summer, and they would "correct" it.
 */
export function toLocalInput(iso: string | null, timeZone: string): string {
  if (iso === null) return ''
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
  // sv-SE gives "2026-09-19 21:00"; the input wants a T.
  return parts.replace(' ', 'T')
}

/**
 * And back again.
 *
 * Works out the zone's offset at that moment by formatting a guess and
 * measuring how far off it landed, which handles both summer time and the two
 * nights a year the clocks move without a table of rules.
 */
const LOCAL_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export function fromLocalInput(value: string, timeZone: string): string | null {
  // The shape is checked before parsing, not after. V8's date parser is
  // lenient enough to pull a year out of almost any string — "not a date:00Z"
  // comes back as the first of January 2000, not as Invalid Date — so a NaN
  // check alone lets rubbish through as a real timestamp.
  if (!LOCAL_INPUT.test(value)) return null

  const guess = new Date(`${value}:00Z`)
  if (Number.isNaN(guess.getTime())) return null

  const shown = toLocalInput(guess.toISOString(), timeZone)
  const drift = new Date(`${shown}:00Z`).getTime() - guess.getTime()
  return new Date(guess.getTime() - drift).toISOString()
}
