import { DbError, unwrapAs } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * Qui ha fitxat, i què es va veure quan ho va fer.
 *
 * Aquesta llista existeix perquè els punts es donen a l'instant. La comprovació
 * és posterior i és humana: mires la columna dels metres i el que va fitxar des
 * de quatre quilòmetres es veu sol. No hi ha res automàtic aquí a posta —
 * ningú revisaria cent fitxatges, i un llindar que decidís sol acabaria traient
 * els punts a algú que era dins d'un edifici amb mal GPS.
 */

export interface CheckinRow {
  readonly user_id: string
  readonly nombre: string
  readonly avatar_url: string | null
  readonly checked_in_at: string | null
  readonly checkin_via: 'qr' | 'ubicacio' | 'manual' | null
  readonly checkin_dist_m: number | null
  readonly checkin_precisio_m: number | null
  readonly was_registered: boolean | null
  readonly pagado: boolean | null
}

export const checkinKeys = {
  list: (eventId: string) => ['junta', 'checkins', eventId] as const,
}

export async function fetchCheckins(eventId: string): Promise<CheckinRow[]> {
  return unwrapAs<CheckinRow[]>(
    supabase.rpc('admin_checkins', { p_event_id: eventId }).select('*'),
  )
}

/**
 * Treure un fitxatge.
 *
 * `admin_undo_checkin` és la de la migració 23, la mateixa que fa servir el
 * botó de desfer de l'escàner: esborra els punts, torna l'estat que hi havia
 * abans i deixa rastre a l'audit_log. No calia res nou.
 */
export async function undoCheckin(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_undo_checkin', {
    p_event_id: eventId,
    p_user_id: userId,
  })
  if (error) throw new DbError(error)
}
