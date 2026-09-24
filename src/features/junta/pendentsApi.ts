import { DbError, unwrapAs } from '@/lib/db'
import { rpc, supabase } from '@/lib/supabase'

/**
 * Els avisos pendents: per a gent que encara no té compte (migracions 87 i 88).
 *
 * NOMÉS LA JUNTA HI ARRIBA, per RLS, i cap escriptura és directa: les tres
 * accions són RPC `security definer` que miren `is_admin()` i auditen. Aquest
 * fitxer no té ni un `.insert()` ni un `.update()`.
 *
 * DUES LECTURES I NO UNA. Els que esperen són pocs i es baixen tots, perquè són
 * feina; els resolts s'acumulen curs rere curs —la purga només se'n du els que
 * esperen— i es demanen només quan la junta els vol veure, fitats. Una sola
 * lectura sense fitar es tallaria en silenci a les mil files de `max_rows`.
 */

export interface PendentRow {
  readonly id: string
  readonly nom: string
  /** Null un cop resolt: la base l'esborra en enllaçar-lo o retirar-lo. */
  readonly telefon: string | null
  readonly tipus: string
  readonly gravetat: number
  readonly punts: number
  readonly nota: string
  readonly mesura_presa: string | null
  readonly falta_at: string
  readonly created_at: string
  readonly enllacat_at: string | null
  readonly enllacat_via: 'telefon' | 'ma' | null
  readonly motiu: 'ambigu' | 'avis_sostre' | 'avis_fora_del_curs' | 'error' | null
  readonly motiu_codi: string | null
  readonly retirat_at: string | null
  readonly retirat_nota: string | null
  /** A qui es va enllaçar, resolt per les claus foranes. */
  readonly avis: { readonly profile: { readonly nombre: string } | null } | null
}

export const pendentsKeys = {
  all: () => ['junta', 'pendents'] as const,
  esperen: () => ['junta', 'pendents', 'esperen'] as const,
  resolts: () => ['junta', 'pendents', 'resolts'] as const,
}

const COLS =
  'id, nom, telefon, tipus, gravetat, punts, nota, mesura_presa, falta_at, created_at, ' +
  'enllacat_at, enllacat_via, motiu, motiu_codi, retirat_at, retirat_nota, ' +
  'avis:avisos!avisos_pendents_avis_id_fkey(profile:profiles!avisos_user_id_fkey(nombre))'

/** Quants resolts es baixen quan la junta els vol veure: els més recents. */
export const RESOLTS = 50

export async function fetchPendentsEsperen(): Promise<PendentRow[]> {
  return unwrapAs<PendentRow[]>(
    supabase
      .from('avisos_pendents')
      .select(COLS)
      .is('enllacat_at', null)
      .is('retirat_at', null)
      .order('falta_at', { ascending: false }),
  )
}

export async function fetchPendentsResolts(): Promise<PendentRow[]> {
  return unwrapAs<PendentRow[]>(
    supabase
      .from('avisos_pendents')
      .select(COLS)
      .or('enllacat_at.not.is.null,retirat_at.not.is.null')
      .order('created_at', { ascending: false })
      .limit(RESOLTS),
  )
}

/**
 * Registrar-ne un.
 *
 * PEL `rpc()` GENÈRIC, com `avisa`: el generador escriu com a obligatoris els
 * paràmetres que tenen valor per defecte i admeten null.
 */
export async function creaPendent(p: {
  readonly nom: string
  readonly telefon: string
  readonly faltaAt: string
  readonly tipus: string
  readonly gravetat: number | null
  readonly nota: string
  readonly punts: number
  readonly mesuraPresa: string | null
}): Promise<string> {
  const { data, error } = await rpc<string>('crea_avis_pendent', {
    p_nom: p.nom,
    p_telefon: p.telefon,
    p_falta_at: p.faltaAt,
    p_tipus: p.tipus,
    p_nota: p.nota,
    p_punts: p.punts,
    p_gravetat: p.gravetat,
    p_mesura_presa: p.mesuraPresa,
  })
  if (error) throw new DbError(error)
  return data ?? ''
}

export async function retiraPendent(id: string, nota: string): Promise<void> {
  const { error } = await supabase.rpc('retira_avis_pendent', { p_id: id, p_nota: nota })
  if (error) throw new DbError(error)
}

/**
 * Enllaçar-ne un a mà. Els refusos del nucli —el sostre, la persona— pugen amb
 * el seu HINT i la pantalla els tradueix.
 */
export async function enllacaPendent(id: string, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('enllaca_avis_pendent', {
    p_id: id,
    p_user_id: userId,
  })
  if (error) throw new DbError(error)
  return data
}
