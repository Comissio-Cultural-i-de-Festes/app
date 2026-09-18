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
 *
 * I LA FINESTRA ENRERE ÉS LA DE LA PORTA, VUIT HORES, no les sis de la pantalla
 * de casa. `junta_home()` posa a la porta qualsevol esdeveniment començat fins
 * a vuit hores enrere i en pinta les files «N no han pagat» i «N esperen
 * resposta», que porten totes dues a /junta/pagaments/<id>. Amb sis hores
 * aquesta llista no arribava tan enrere: entre les sis i les vuit, la fila
 * existia, l'enllaç canviava la URL i la pantalla deia «Encara no hi ha res al
 * calendari» amb el selector d'esdeveniments dibuixat just a sobre.
 *
 * Es queda aquí i no a `home/api.ts` perquè són dues finestres que responen a
 * dues preguntes: la de casa és «què és el següent» i aquesta és «què està
 * obert per treballar-hi». Fer-ne una de sola voldria dir moure també la
 * pantalla de casa a vuit hores, que és el que la 69 no va fer.
 */

const COLUMNS = 'id, titulo, tipo, starts_at, published, reveal_at, revelat, precio_cents, plazas'

const HOUR_MS = 3_600_000

/** Les mateixes vuit hores que `junta_home()`, migració 69. Si una canvia, l'altra també. */
export const JUNTA_BACK_MS = 8 * HOUR_MS

/** Arrodonit a l'hora, com el de casa: una clau de cau estable i no una de nova a cada render. */
export function juntaHorizonIso(now: number = Date.now()): string {
  return new Date(Math.floor((now - JUNTA_BACK_MS) / HOUR_MS) * HOUR_MS).toISOString()
}

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
