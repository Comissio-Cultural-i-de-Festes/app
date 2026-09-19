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
 * La fila del curs: la mateixa que tria `private.periode_curs()`, per
 * construcció i no per sort.
 *
 * NO ÉS `defaultPeriod`, I LA DIFERÈNCIA VA COSTAR DE VEURE. `defaultPeriod`
 * és la primera fila per `ordre`, sigui quina sigui la seva `mena`: és una
 * preferència de pantalla —quina pestanya surt oberta al rànquing— i la junta
 * l'ha de poder moure. La finestra del sostre d'avisos i la del comptador
 * d'avisos NO són una preferència: han de dir el mateix que
 * `where mena = 'global' order by ordre, codi limit 1`, que és el que la base
 * mira dins d'`avisa()`. Avui les dues coincideixen només perquè la fila
 * sembrada `curs` és `global` i té `ordre` 0, i `admin_save_periods` no exigeix
 * ni que existeixi cap fila `global` ni que vagi primera: només refusa dos
 * `ordre` repetits. O sigui que un dia la junta podria posar un trimestre
 * davant i el comptador de la pantalla es separaria del sostre de la base
 * sense que res ho digués.
 *
 * SENSE CAP FILA `global` TORNA NULL, i no la primera que hi hagi. És el mateix
 * que fa la funció de la base —sense fila, els dos límits són NULL i la
 * finestra és oberta— i és millor que inventar-se un curs: qui ho llegeix ja
 * sap distingir «no hi ha períodes configurats» de «el curs va d'aquí a aquí».
 *
 * L'EMPAT PER `codi` és el desempat de la funció. Amb dues files `global` amb
 * el mateix `ordre` —que `admin_save_periods` no permet, però la taula sí—
 * les dues bandes han de triar la mateixa, i el criteri ha de ser el mateix.
 */
export function cursPeriod(periods: readonly Period[] | undefined): Period | null {
  const globals = (periods ?? []).filter((p) => p.mena === 'global')
  if (globals.length === 0) return null
  return globals.reduce((millor, p) =>
    p.ordre < millor.ordre || (p.ordre === millor.ordre && p.codi < millor.codi) ? p : millor,
  )
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
