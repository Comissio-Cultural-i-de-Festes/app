import { DbError, unwrap, unwrapAs } from '@/lib/db'
import { supabase } from '@/lib/supabase'

import type { Streak } from './streak'

/**
 * Where the points came from, and what has happened lately.
 *
 * Both read `points_log`, which every member may read for themselves and for
 * nobody else. The breakdown is worked out here rather than in SQL: it is a
 * dozen rows, grouping them client-side costs nothing, and a view would be one
 * more thing whose privileges have to be got right.
 */

export type PointMotive =
  'asistencia' | 'montaje' | 'trajo_gente' | 'propuso' | 'conduir' | 'manual'

export interface PointRow {
  readonly motivo: PointMotive
  readonly puntos: number
  readonly created_at: string
  readonly nota: string | null
  readonly events: { readonly titulo: string } | null
}

export const profileScreenKeys = {
  points: (userId: string) => ['profile', 'points', userId] as const,
  attended: (userId: string) => ['profile', 'attended', userId] as const,
  streak: (userId: string) => ['profile', 'streak', userId] as const,
}

/**
 * La ratxa, calculada pel servidor a cada crida.
 *
 * No es desa enlloc a posta: un comptador desat es desquadraria el dia que la
 * junta desfés un fitxatge amb `admin_undo_checkin`. El que decideix quines
 * activitats compten viu tot a `private.streak_rows()`, i el client no en sap
 * res — ni ho ha de saber, perquè una regla que viu al navegador és una regla
 * que es pot reescriure.
 */
export async function fetchStreak(): Promise<Streak> {
  const { data, error } = await supabase.rpc('my_streak')
  if (error) throw new DbError(error)
  return data as unknown as Streak
}

/**
 * Your rows, and the filter is not optional.
 *
 * `points_log` has two select policies: one for your own rows and one that
 * hands an admin the whole ledger. Leaning on row-level security to scope this
 * works perfectly for an ordinary member and shows somebody on the junta the
 * association's entire points history as though it were their own — which is
 * what it did until this line was added.
 */
export async function fetchMyPoints(userId: string): Promise<PointRow[]> {
  return unwrapAs<PointRow[]>(
    supabase
      .from('points_log')
      .select('motivo, puntos, created_at, nota, events(titulo)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
  )
}

/** How many events you have actually turned up to. Counted, not listed. */
export async function fetchAttendedCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('attendances')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('estado', 'asistio')

  if (error) throw new DbError(error)
  return count ?? 0
}

export interface MotiveTotal {
  readonly motivo: PointMotive
  readonly punts: number
  readonly vegades: number
}

/**
 * Totals per reason, biggest first.
 *
 * Corrections are negative rows in the same ledger, so a reason can net to
 * zero or below; those still belong in the list, because "montaje 0" after an
 * argument is information and a missing line is not.
 */
export function byMotive(rows: readonly PointRow[]): MotiveTotal[] {
  const totals = new Map<PointMotive, MotiveTotal>()

  for (const row of rows) {
    const seen = totals.get(row.motivo)
    totals.set(row.motivo, {
      motivo: row.motivo,
      punts: (seen?.punts ?? 0) + row.puntos,
      vegades: (seen?.vegades ?? 0) + 1,
    })
  }

  return [...totals.values()].sort((a, b) => b.punts - a.punts)
}

export async function setHideFromRanking(userId: string, hidden: boolean): Promise<void> {
  await unwrap(
    supabase.from('profiles').update({ hide_from_ranking: hidden }).eq('id', userId).select('id'),
  )
}
