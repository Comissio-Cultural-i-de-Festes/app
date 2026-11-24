import { DbError, unwrapAs } from '@/lib/db'
import { supabase } from '@/lib/supabase'

import type { FilaViatger } from './viatger'

/**
 * Les meves dades de viatger per a un esdeveniment.
 *
 * DIRECTE A LA TAULA I NO PER RPC: la política de la migració 90 és
 * `user_id = auth.uid()`, i el que no és teu no hi és. Les validacions són els
 * CHECK de la taula; `llegeixViatger` les ha passades abans d'arribar aquí.
 *
 * NO HI HA CUA. Són dades personals i no es guarden al mòbil: ni IndexedDB ni
 * `localStorage`. Sense xarxa, la crida falla i la pantalla ho diu; el que hi
 * havia escrit es queda al formulari mentre no se'n surti.
 *
 * NI `upsert`. PostgREST escriu totes les columnes del cos a la branca ON
 * CONFLICT, i `event_id` i `user_id` no tenen grant d'UPDATE: es refusaria amb
 * 42501 abans de cap política (és el mateix que diu `setAnswer` a l'Inici).
 */

/**
 * LA PERSONA VA DINS DE LA CLAU. En un mòbil compartit, qui entra després a la
 * mateixa pestanya no ha de trobar a la cau el que va obrir qui hi havia abans:
 * amb la clau només de l'esdeveniment, B rebia el document d'A abans que la
 * consulta tornés, i si premia «Desa» el desava com a seu. `totes` és el
 * prefix que s'invalida quan alguna cosa ho pot haver canviat —desar, esborrar,
 * dir que sí o que no—.
 */
export const viatgerKeys = {
  totes: (eventId: string) => ['event', eventId, 'viatger'] as const,
  demana: (eventId: string) => ['event', eventId, 'viatger', 'demana'] as const,
  meves: (eventId: string, userId: string) =>
    ['event', eventId, 'viatger', 'meves', userId] as const,
  marca: (eventId: string, userId: string) =>
    ['event', eventId, 'viatger', 'marca', userId] as const,
}

const COLUMNES =
  'nom, cognom1, cognom2, sexe, tipus_document, numero_document, numero_suport, ' +
  'nacionalitat, data_naixement, adreca, localitat, pais, telefon_emergencia, updated_at'

export type MevesDades = FilaViatger & { readonly updated_at: string }

/**
 * Si l'esdeveniment demana les dades. Es llegeix d'`events` i no
 * d'`events_public`: la casella no és a la vista (vegeu la migració 90), i
 * `events` té la mateixa política de lectura.
 *
 * Sense fila, `false`: un esdeveniment que no veus no et demana res.
 */
export async function fetchDemanaViatger(eventId: string): Promise<boolean> {
  const rows = await unwrapAs<{ demana_viatger: boolean }[]>(
    supabase.from('events').select('demana_viatger').eq('id', eventId).limit(1),
  )
  return rows[0]?.demana_viatger ?? false
}

export async function fetchMevesDades(eventId: string, userId: string): Promise<MevesDades | null> {
  const rows = await unwrapAs<MevesDades[]>(
    supabase
      .from('dades_viatger')
      .select(COLUMNES)
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .limit(1),
  )
  return rows[0] ?? null
}

/**
 * Primer l'UPDATE i, si no hi havia res, l'INSERT. No es fia de si la pantalla
 * creu que la fila hi és: entre que es va obrir el formulari i ara la pot haver
 * esborrat la purga, la casella de la junta o un «no» des d'un altre mòbil, i
 * un UPDATE de zero files no és cap error —tornaria «desat» sense haver desat
 * res.
 */
/**
 * Només si hi són i quan es van tocar: és el que la fitxa necessita, i la
 * fitxa s'obre molt més sovint que el formulari. Els tretze camps no surten de
 * la base fins que algú els vol veure.
 */
export async function fetchMevaMarca(
  eventId: string,
  userId: string,
): Promise<{ readonly updated_at: string } | null> {
  const rows = await unwrapAs<{ updated_at: string }[]>(
    supabase
      .from('dades_viatger')
      .select('updated_at')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .limit(1),
  )
  return rows[0] ?? null
}

export async function desaMevesDades(
  eventId: string,
  userId: string,
  fila: FilaViatger,
): Promise<void> {
  const editades = await unwrapAs<unknown[]>(
    supabase
      .from('dades_viatger')
      .update(fila)
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .select('user_id'),
  )
  if (editades.length > 0) return

  const { error } = await supabase
    .from('dades_viatger')
    .insert({ event_id: eventId, user_id: userId, ...fila })
  if (error) throw new DbError(error)
}

export async function esborraMevesDades(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('dades_viatger')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId)
  if (error) throw new DbError(error)
}
