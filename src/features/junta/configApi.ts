import type { Period } from '@/features/ranking/api'
import { DbError, unwrapAs } from '@/lib/db'
import type { Escola } from '@/lib/model'
import { supabase } from '@/lib/supabase'

import { toLocalInput, fromLocalInput } from './eventFormApi'

/**
 * The three tables the junta configures.
 *
 * All three were writable straight from the client until migrations 24 to 26,
 * with a `for all` admin policy and no trail. Everything else had already
 * moved to audited functions — invitations in 16, publishing in 19, deleting
 * an event in 22 — and these were the last way to change what the app means
 * without leaving a mark.
 *
 * They are also the three that, until now, only somebody with a Supabase
 * dashboard account could touch. That is one person.
 */

export const configKeys = {
  graus: () => ['junta', 'config', 'graus'] as const,
}

export interface Grau {
  readonly id: string
  readonly escola: Escola
  readonly nom: string
  readonly ordre: number
}

export async function fetchAllGraus(): Promise<Grau[]> {
  return unwrapAs<Grau[]>(
    supabase.from('graus').select('id, escola, nom, ordre').order('escola').order('ordre'),
  )
}

export async function saveGrau(grau: {
  readonly id: string | null
  readonly escola: Escola
  readonly nom: string
  readonly ordre: number
}): Promise<void> {
  const { error } = await supabase.rpc('admin_save_grau', {
    p_escola: grau.escola,
    p_nom: grau.nom,
    p_ordre: grau.ordre,
    ...(grau.id === null ? {} : { p_id: grau.id }),
  })
  if (error) throw new DbError(error)
}

export async function deleteGrau(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_grau', { p_id: id })
  if (error) throw new DbError(error)
}

export async function setPointValue(value: {
  readonly mena: string
  readonly clau: string
  readonly punts: number
}): Promise<void> {
  const { error } = await supabase.rpc('admin_set_point_value', {
    p_mena: value.mena,
    p_clau: value.clau,
    p_punts: value.punts,
  })
  if (error) throw new DbError(error)
}

export async function savePeriods(periods: readonly Period[]): Promise<void> {
  const { error } = await supabase.rpc('admin_save_periods', {
    p_periods: periods as unknown as never,
  })
  if (error) throw new DbError(error)
}

/**
 * A term boundary is a day, not a moment.
 *
 * `toLocalInput` already does the hard half — turning a UTC instant into the
 * wall-clock text an input can hold, in the association's zone rather than the
 * viewer's — and it has seven tests behind it. This is the same thing with the
 * time cut off, so nobody is asked what minute the second term begins.
 */
export function toDateInput(iso: string | null, timeZone: string): string {
  return toLocalInput(iso, timeZone).slice(0, 10)
}

/** And back: midnight in the association's zone on that day. */
export function fromDateInput(value: string, timeZone: string): string | null {
  return fromLocalInput(`${value}T00:00`, timeZone)
}

/**
 * The chain of boundaries the screen actually edits.
 *
 * Four rows with a start and an end each is not what a calendar is. The end of
 * one term IS the start of the next, and editing them as separate fields is
 * how a gap or an overlap gets typed in the first place — which is exactly
 * what `admin_save_periods` now refuses.
 *
 * So the screen edits N+1 dates for N terms, and this turns them back into
 * rows. The whole-course row follows the first boundary rather than having its
 * own field: two inputs that both mean "when the course starts" is a worse
 * problem than the one it would solve.
 */
export function periodsFromChain(
  periods: readonly Period[],
  chain: readonly string[],
  timeZone: string,
): Period[] | null {
  const trams = periods.filter((p) => p.mena === 'tram').sort(byOrdre)
  if (chain.length !== trams.length + 1) return null

  const bounds = chain.map((day) => fromDateInput(day, timeZone))
  if (bounds.some((b) => b === null)) return null

  const first = bounds[0] ?? null

  return periods.map((period) => {
    if (period.mena !== 'tram') {
      // The course starts where the first term does and does not end. Migration
      // 24 exempts a `global` from the chain check for exactly this reason.
      return { ...period, starts_at: first, ends_at: null }
    }
    const index = trams.findIndex((t) => t.codi === period.codi)
    return { ...period, starts_at: bounds[index] ?? null, ends_at: bounds[index + 1] ?? null }
  })
}

/** The dates the inputs start on: each term's start, then the last one's end. */
export function chainFromPeriods(periods: readonly Period[], timeZone: string): string[] {
  const trams = periods.filter((p) => p.mena === 'tram').sort(byOrdre)
  const last = trams[trams.length - 1]
  return [
    ...trams.map((t) => toDateInput(t.starts_at, timeZone)),
    toDateInput(last?.ends_at ?? null, timeZone),
  ]
}

function byOrdre(a: Period, b: Period): number {
  return a.ordre - b.ordre
}
