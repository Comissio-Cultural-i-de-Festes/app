import { unwrapAs } from '@/lib/db'
import type { EventRow } from '@/lib/schema'
import { supabase } from '@/lib/supabase'

/**
 * The junta's own list of events, drafts included.
 *
 * The member-facing list filters `published = true`, which is right for a home
 * screen and wrong here: "Guarda i plega" writes a row nobody can see, and if
 * this screen applied the same filter the draft would be saved and then lost.
 * The only way back to it is a list that shows it.
 */

const COLUMNS = 'id, titulo, starts_at, published, reveal_at, revelat, precio_cents, plazas'

export const juntaEventKeys = {
  list: (horizon: string) => ['junta', 'events', horizon] as const,
}

export async function fetchJuntaEvents(horizon: string, limit = 20): Promise<EventRow[]> {
  return unwrapAs<EventRow[]>(
    supabase
      .from('events_public')
      .select(COLUMNS)
      .gte('starts_at', horizon)
      .order('starts_at', { ascending: true })
      .limit(limit),
  )
}
