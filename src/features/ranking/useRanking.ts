import { useQuery } from '@tanstack/react-query'

import {
  type Bounds,
  type Period,
  type RankingRow,
  type SchoolRow,
  fetchPeriods,
  fetchRanking,
  fetchSchools,
  periodBounds,
  periodIsCurrent,
  hourFloorIso,
  positionDeltas,
  rankingKeys,
  weekAgoIso,
} from './api'

/**
 * The periods are four rows the junta edits perhaps once a year, so they are
 * worth holding on to across a session rather than refetching with everything
 * else on every focus.
 */
const PERIODS_STALE_MS = 30 * 60_000

export function usePeriods() {
  return useQuery({
    queryKey: rankingKeys.periods(),
    queryFn: fetchPeriods,
    staleTime: PERIODS_STALE_MS,
  })
}

/** The first row by `ordre`, which is the whole course unless the junta says otherwise. */
export function defaultPeriod(periods: readonly Period[] | undefined): Period | null {
  return periods?.[0] ?? null
}

export interface Board {
  readonly rows: readonly RankingRow[]
  readonly schools: readonly SchoolRow[]
  /** Places moved since last week, positive for upward. Empty for a period that has ended. */
  readonly deltas: ReadonlyMap<string, number>
  /** Points each school has taken in the last seven days. Empty for a period that has ended. */
  readonly weekly: ReadonlyMap<string, number>
  readonly isPending: boolean
  readonly isError: boolean
  readonly error: Error | null
  readonly refetch: () => void
}

const NO_DELTAS: ReadonlyMap<string, number> = new Map()

/**
 * One period's standings, plus how far things moved this week.
 *
 * The movement is not stored anywhere. It is the same ranking asked for a
 * second time with the clock wound back seven days, which costs one more
 * request and cannot drift out of step with the live table the way a weekly
 * snapshot would.
 */
export function useBoard(period: Period | null): Board {
  const bounds = periodBounds(period)
  const current = periodIsCurrent(period)
  const weekAgo = weekAgoIso()

  const priorBounds: Bounds = { from: bounds.from, to: weekAgo }
  // Capped at now, not at the end of the period. Points can be attached to an
  // event that has not happened yet — the junta awards setup points in advance
  // sometimes — and those are dated to the event, so an open upper bound would
  // count next month's evening as movement that happened this week.
  const weekBounds: Bounds = { from: weekAgo, to: hourFloorIso() }

  const rows = useQuery({
    queryKey: rankingKeys.individual(bounds),
    queryFn: () => fetchRanking(bounds),
  })
  const schools = useQuery({
    queryKey: rankingKeys.schools(bounds),
    queryFn: () => fetchSchools(bounds),
  })
  const prior = useQuery({
    queryKey: rankingKeys.individual(priorBounds),
    queryFn: () => fetchRanking(priorBounds),
    enabled: current,
  })
  const week = useQuery({
    queryKey: rankingKeys.schools(weekBounds),
    queryFn: () => fetchSchools(weekBounds),
    enabled: current,
  })

  const deltas =
    current && rows.data && prior.data ? positionDeltas(rows.data, prior.data) : NO_DELTAS

  const weekly =
    current && week.data ? new Map(week.data.map((s) => [s.escola, s.punts_totals])) : NO_DELTAS

  return {
    rows: rows.data ?? [],
    schools: schools.data ?? [],
    deltas,
    weekly,
    // The two movement queries are deliberately not part of this: the board is
    // usable without them, and a slow second request should not hold the whole
    // table behind a spinner.
    isPending: rows.isPending || schools.isPending,
    isError: rows.isError || schools.isError,
    error: rows.error ?? schools.error,
    refetch: () => {
      void rows.refetch()
      void schools.refetch()
    },
  }
}
