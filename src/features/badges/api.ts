import { DbError } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * Les insígnies.
 *
 * `my_badges()` NO ÉS UNA CONSULTA INNOCENT: reparteix el que toqui abans de
 * tornar res. Això és el que la fa retroactiva —la primera vegada que algú obre
 * la pantalla se li donen totes les que ja tenia guanyades des del setembre— i
 * també és el que obliga a no cridar-la des de qualsevol lloc per si de cas.
 *
 * I `mark_badges_seen()` va a part a posta. Si apagués la bandera de «nova»
 * dins de la mateixa crida, una pantalla que es queda a mig carregar es menjaria
 * la celebració per sempre. Es tanca quan la graella s'ha pintat de debò.
 */

export interface BadgeRow {
  readonly codi: string
  readonly earned_at: string
  /** Encara no ensenyada. És el que fa que la celebració sigui una i prou. */
  readonly nova: boolean
  readonly event_id: string | null
  readonly titol: string | null
  readonly starts_at: string | null
}

export interface BadgeHolders {
  readonly codi: string
  readonly quants: number
  /** Socis actius, el denominador de «la tenen 23 de 97». */
  readonly total: number
  /** Fins a tres cares. Qui s'amaga del rànquing compta però no hi surt. */
  readonly cares: readonly string[] | null
}

export const badgeKeys = {
  /** Tot el que en depèn, per invalidar-ho d'un cop quan es fitxa. */
  all: () => ['badges'] as const,
  mine: (userId: string) => ['badges', 'mine', userId] as const,
  holders: () => ['badges', 'holders'] as const,
}

export async function fetchMyBadges(): Promise<BadgeRow[]> {
  const { data, error } = await supabase.rpc('my_badges')
  if (error) throw new DbError(error)
  return data ?? []
}

export async function fetchHolders(): Promise<BadgeHolders[]> {
  const { data, error } = await supabase.rpc('badge_holders')
  if (error) throw new DbError(error)
  return data ?? []
}

/** Quantes n'hi havia per ensenyar. El número només serveix per no cridar-ho en va. */
export async function markBadgesSeen(): Promise<number> {
  const { data, error } = await supabase.rpc('mark_badges_seen')
  if (error) throw new DbError(error)
  return data ?? 0
}
