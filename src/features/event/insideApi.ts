import { unwrapAs } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * Who the scanner has let in.
 *
 * No migration behind this and none needed: `att_select_public_si` already
 * publishes the rows with `estado in ('si', 'asistio')` to any active member,
 * and every column of `attendances` is in the read grant. So "who is inside"
 * is a question the schema could already answer — it had just never been
 * asked.
 */

export interface Inside {
  readonly user_id: string
  readonly checked_in_at: string
  readonly nombre: string
  readonly avatar_url: string | null
}

export const insideKeys = {
  list: (eventId: string) => ['inside', eventId] as const,
}

export async function fetchInside(eventId: string): Promise<Inside[]> {
  const rows = await unwrapAs<
    {
      user_id: string
      checked_in_at: string | null
      profiles: { nombre: string; avatar_url: string | null } | null
    }[]
  >(
    supabase
      .from('attendances')
      .select('user_id, checked_in_at, profiles!attendances_user_id_fkey(nombre, avatar_url)')
      .eq('event_id', eventId)
      .eq('estado', 'asistio')
      .order('checked_in_at', { ascending: false }),
  )

  return rows
    .filter((r) => r.checked_in_at !== null && r.profiles !== null)
    .map((r) => ({
      user_id: r.user_id,
      checked_in_at: r.checked_in_at ?? '',
      nombre: r.profiles?.nombre ?? '',
      avatar_url: r.profiles?.avatar_url ?? null,
    }))
}
