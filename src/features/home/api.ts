import { IN_PROGRESS_MS } from '@/lib/eventEnd'
import type { Answer, AttendanceState } from '@/lib/model'
import type { EventRow } from '@/lib/schema'
import { DbError, unwrapAs } from '@/lib/db'
import { supabase } from '@/lib/supabase'

import type { EventSummary } from './summary'

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

const EVENT_COLUMNS =
  'id, titulo, tipo, starts_at, teaser, reveal_at, revelat, plazas, ' +
  'precio_cents, puntos, cal_confirmacio, descripcion, ubicacion, ends_at, cover_url'

const HOUR_MS = 3_600_000

/**
 * An event stays "next" for six hours after it starts.
 *
 * Otherwise the party you are standing at disappears from the home screen
 * halfway through it and is replaced by whatever comes in October, which is
 * the one moment the app is most likely to be open. Rounded to the hour so the
 * boundary is a stable cache key rather than a new one every render.
 *
 * Les sis hores viuen a `@/lib/eventEnd` i no aquí, que és on van néixer:
 * aquesta és la pregunta «què ve ara» i allà hi ha la inversa, «ja s'ha
 * acabat», que quatre pantalles es feien cadascuna pel seu compte.
 */
export function horizonIso(now: number = Date.now()): string {
  return new Date(Math.floor((now - IN_PROGRESS_MS) / HOUR_MS) * HOUR_MS).toISOString()
}

export const homeKeys = {
  upcoming: (horizon: string) => ['home', 'upcoming', horizon] as const,
  previous: (horizon: string) => ['home', 'previous', horizon] as const,
  summaries: (eventIds: readonly string[]) => ['home', 'summaries', ...eventIds] as const,
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
 * El resum de les assistències dels esdeveniments que hi ha a la pantalla.
 *
 * Una fila per esdeveniment i no totes les respostes amb el perfil de
 * cadascú: per pintar un número, tres cares i la meva resposta, l'Inici
 * baixava unes sis-centes files a cada obertura. La funció és `security
 * invoker`, o sigui que compta el que la RLS deixa llegir a qui pregunta: tots
 * els sí i els fitxats, més les meves respostes, siguin quines siguin; a un
 * pendent, només les seves.
 */
export async function fetchSummaries(eventIds: readonly string[]): Promise<EventSummary[]> {
  if (eventIds.length === 0) return []
  return unwrapAs<EventSummary[]>(
    supabase.rpc('resum_assistencies', { p_event_ids: [...eventIds] }),
  )
}

/**
 * Not `.upsert()`.
 *
 * PostgREST writes every column of the body in the ON CONFLICT branch, and the
 * client may only update `estado` — moving your row onto somebody else's
 * user_id is precisely what the column grants stop. The generic upsert is
 * refused with 42501 before any policy runs. See migration 12.
 */
export interface AnswerResult {
  /** What was actually recorded. Asking for 'si' on a full event lands here as 'espera'. */
  readonly estado: AttendanceState
  readonly ple: boolean
  /** Place in the queue, when the answer became one. */
  readonly posicio: number | null
}

export async function setAnswer(eventId: string, estado: Answer): Promise<AnswerResult> {
  const { data, error } = await supabase.rpc('set_attendance', {
    p_event_id: eventId,
    p_estado: estado,
  })
  if (error) throw new DbError(error)
  return data as unknown as AnswerResult
}

// ── derived, and tested on its own ──────────────────────────────────────────

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
