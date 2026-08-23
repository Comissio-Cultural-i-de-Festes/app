import type { Escola } from '@/lib/model'
import type { PeriodRow, RankingReturn, SchoolReturn } from '@/lib/schema'
import { unwrapAs } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * The ranking, over a window.
 *
 * Rows come back exactly as the database names them. There is no camelCase
 * translation layer on purpose: it would be one more place a column rename can
 * pass the type checker and produce `undefined` on screen.
 */

export type Period = PeriodRow

/** avatar_url and escola are genuinely nullable; RETURNS TABLE cannot say so. */
export type RankingRow = Omit<RankingReturn, 'avatar_url' | 'escola'> & {
  readonly avatar_url: string | null
  readonly escola: Escola | null
}

export type SchoolRow = Omit<SchoolReturn, 'escola'> & { readonly escola: Escola }

export interface Bounds {
  readonly from: string | null
  readonly to: string | null
}

const HOUR_MS = 3_600_000
const WEEK_MS = 7 * 24 * HOUR_MS

/**
 * A timestamp rounded down to the hour.
 *
 * "Now" and "a week ago" are moving targets, and a moving target in a query
 * key is a cache that never hits and a request on every render. Rounding makes
 * the key stable for an hour, which is also how often the app revalidates
 * anyway.
 */
export function hourFloorIso(now: number = Date.now()): string {
  return new Date(Math.floor(now / HOUR_MS) * HOUR_MS).toISOString()
}

export function weekAgoIso(now: number = Date.now()): string {
  return hourFloorIso(now - WEEK_MS)
}

export function periodBounds(period: Period | null): Bounds {
  return { from: period?.starts_at ?? null, to: period?.ends_at ?? null }
}

/**
 * Whether "this week" means anything for the selected period.
 *
 * Showing somebody how much they moved last week inside a term that ended in
 * December is not a smaller truth, it is a wrong one. When the period is over,
 * the movement column goes away.
 */
export function periodIsCurrent(period: Period | null, now: number = Date.now()): boolean {
  if (!period) return true
  const started = period.starts_at === null || Date.parse(period.starts_at) <= now
  const notEnded = period.ends_at === null || Date.parse(period.ends_at) > now
  return started && notEnded
}

export const rankingKeys = {
  periods: () => ['ranking', 'periods'] as const,
  individual: (b: Bounds) => ['ranking', 'individual', b.from, b.to] as const,
  schools: (b: Bounds) => ['ranking', 'schools', b.from, b.to] as const,
}

export async function fetchPeriods(): Promise<Period[]> {
  return unwrapAs<Period[]>(
    supabase
      .from('ranking_periods')
      .select('codi, etiqueta, mena, starts_at, ends_at, ordre')
      .order('ordre'),
  )
}

/**
 * An open bound is an omitted argument, not a null one.
 *
 * The function declares `default null` for both, so leaving them out is what
 * asks for "no limit". Sending an explicit null would work too, but the
 * generated Args type calls them optional strings, and this keeps the call
 * honest rather than casting around it.
 */
function args(bounds: Bounds): { p_from?: string; p_to?: string } {
  const out: { p_from?: string; p_to?: string } = {}
  if (bounds.from !== null) out.p_from = bounds.from
  if (bounds.to !== null) out.p_to = bounds.to
  return out
}

export async function fetchRanking(bounds: Bounds): Promise<RankingRow[]> {
  return unwrapAs<RankingRow[]>(supabase.rpc('ranking_period', args(bounds)))
}

export async function fetchSchools(bounds: Bounds): Promise<SchoolRow[]> {
  return unwrapAs<SchoolRow[]>(supabase.rpc('ranking_escoles_period', args(bounds)))
}

/**
 * How many places somebody has moved since last week, positive for upward.
 *
 * Derived by asking for the same ranking with the clock wound back rather than
 * stored: a weekly snapshot table would be a second source of truth about
 * positions, and the two would disagree the first time a point was corrected
 * retroactively.
 */
export function positionDeltas(
  now: readonly RankingRow[],
  before: readonly RankingRow[],
): ReadonlyMap<string, number> {
  const was = new Map(before.map((r) => [r.user_id, r.posicio]))
  const deltas = new Map<string, number>()
  for (const row of now) {
    const previous = was.get(row.user_id)
    if (previous !== undefined) deltas.set(row.user_id, previous - row.posicio)
  }
  return deltas
}
