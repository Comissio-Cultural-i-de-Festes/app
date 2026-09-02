import { DbError, unwrapAs } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * Les reunions: qui hi ha de venir, i tancar-la.
 *
 * PER QUÈ UNA LLISTA A PART I NO LA DE LES FESTES. A una festa la llista
 * pública són només els sí —«un llistat públic de qui ha dit que no assenyala
 * la gent», diu la política d'`attendances`. A una reunió és el contrari: «sou
 * pocs i cal saber si hi haurà ningú», i per tant es veu qui no hi ve i qui
 * encara no ha dit res. Són dues regles oposades i per això
 * `meeting_roster` és una funció definer pròpia en comptes d'un filtre sobre
 * la de les festes.
 *
 * I LA LLISTA DEPÈN DE L'ÀMBIT. Per a una reunió de junta són els admins; per
 * a una de comi, tots els socis actius. La funció ho decideix ella i també
 * comprova qui pregunta: un soci no pot demanar el llistat d'una reunió de
 * junta, que és com sabria qui hi és.
 */

/**
 * Els estats que `meeting_roster` pot tornar.
 *
 * `pendent` no és cap valor d'`attendances.estado`: és el `coalesce` de la
 * funció per a qui encara no ha contestat res, i a una reunió això és
 * informació —«sou pocs i cal saber si es fa»— i no una absència de dades.
 *
 * La unió és tancada i no `| string`: així la pantalla ha de tractar cada cas,
 * i el dia que la base torni un valor nou el compilador ho diu.
 */
export type MeetingState = 'asistio' | 'si' | 'no' | 'potser' | 'pendent'

export interface RosterRow {
  readonly user_id: string
  readonly nombre: string
  readonly avatar_url: string | null
  readonly estado: MeetingState
}

export const meetingKeys = {
  roster: (eventId: string) => ['meeting', eventId, 'roster'] as const,
  list: () => ['junta', 'meetings'] as const,
}

export async function fetchRoster(eventId: string): Promise<RosterRow[]> {
  return unwrapAs<RosterRow[]>(supabase.rpc('meeting_roster', { p_event_id: eventId }))
}

export interface CloseResult {
  readonly hi_eren: number
  readonly punts: number
}

/**
 * Tanca la reunió: marca qui hi era, reparteix els punts i desa l'acta.
 *
 * Una sola crida amb la llista sencera, i és l'única del repositori que
 * reparteix punts en bloc. `features/door/api.ts` ho fa amb una crida per
 * persona a posta —un error a mig camí ha de deixar els quatre primers
 * cobrats— i una reunió és el cas contrari: es tanca una vegada, i quedar-se a
 * mitges deixaria una reunió tancada amb la meitat de la gent pagada i sense
 * manera de saber quina meitat.
 */
export async function closeMeeting(
  eventId: string,
  userIds: readonly string[],
  acta: string | null,
): Promise<CloseResult> {
  const { data, error } = await supabase.rpc('admin_close_meeting', {
    p_event_id: eventId,
    p_user_ids: [...userIds],
    ...(acta === null || acta.trim() === '' ? {} : { p_acta: acta.trim() }),
  })
  if (error) throw new DbError(error)
  return data as unknown as CloseResult
}
