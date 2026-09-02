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
 *
 * SENSE REUNIONS, i les tres pantalles que la criden hi estan d'acord. Al
 * panell tenen el seu bloc just a sobre i sortirien dues vegades a la mateixa
 * pantalla; a Pagaments no hi ha res a cobrar, perquè una reunió no té preu; i
 * a les Idees, una idea no es converteix en una reunió.
 *
 * No és un filtre de seguretat i no ho pretén ser: la junta les veu totes, i
 * les veu al bloc que és seu. Això és triar què va a cada llista.
 */

const COLUMNS = 'id, titulo, tipo, starts_at, published, reveal_at, revelat, precio_cents, plazas'

export const juntaEventKeys = {
  list: (horizon: string) => ['junta', 'events', horizon] as const,
}

export async function fetchJuntaEvents(horizon: string, limit = 20): Promise<EventRow[]> {
  return unwrapAs<EventRow[]>(
    supabase
      .from('events_public')
      .select(COLUMNS)
      .gte('starts_at', horizon)
      .neq('tipo', 'reunio')
      .order('starts_at', { ascending: true })
      .limit(limit),
  )
}
