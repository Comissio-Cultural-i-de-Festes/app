import type { Database } from './database.types'

/**
 * Row shapes, taken from the generated schema and then corrected.
 *
 * `npm run db:types` is right about which columns exist and mostly right about
 * their types. It is wrong about nullability in two directions, and both
 * matter:
 *
 *   * A VIEW erases NOT NULL. Postgres cannot prove that `events_public.id` is
 *     never null through a join, so every column of every view comes back as
 *     `| null`. Taken literally, rendering an event title needs a null check
 *     that can never fire, and after the fourth one somebody reaches for `!`
 *     and the real nulls stop being checked too.
 *
 *   * A function that RETURNS TABLE has no nullability information at all, so
 *     the generator marks every column non-null. That is the dangerous
 *     direction: `avatar_url` and `escola` are genuinely nullable, and the
 *     types say they are not.
 *
 * So the column set comes from the generated file — delete a column and this
 * stops compiling — and the nullability is stated here, next to the reason.
 */

/** Columns a view cannot prove are non-null, but the base table declares. */
type Definite<T, K extends keyof T> = Omit<T, K> & { readonly [P in K]-?: NonNullable<T[P]> }

type PublicEvent = Database['public']['Views']['events_public']['Row']

export type EventRow = Definite<
  PublicEvent,
  'id' | 'titulo' | 'tipo' | 'starts_at' | 'puntos' | 'precio_cents' | 'published' | 'revelat'
>

export type AttendanceTable = Database['public']['Tables']['attendances']['Row']
export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type PeriodRow = Database['public']['Tables']['ranking_periods']['Row']

export type RankingReturn = Database['public']['Functions']['ranking_period']['Returns'][number]
export type SchoolReturn =
  Database['public']['Functions']['ranking_escoles_period']['Returns'][number]
