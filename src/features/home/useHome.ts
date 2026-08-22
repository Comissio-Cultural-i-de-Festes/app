import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  type Period,
  type RankingRow,
  type SchoolRow,
  periodBounds,
  rankingKeys,
} from '@/features/ranking/api'
import { defaultPeriod, usePeriods } from '@/features/ranking/useRanking'
import { fetchRanking, fetchSchools } from '@/features/ranking/api'
import { type MyProfile, fetchProfile, profileKeys } from '@/features/session/profile'
import { useUserId } from '@/features/session/useUserId'
import type { Answer } from '@/lib/model'

import {
  type AttendanceRow,
  type EventRow,
  fetchAttendances,
  fetchPrevious,
  fetchUpcoming,
  homeKeys,
  horizonIso,
  setAnswer,
} from './api'

export interface Home {
  readonly profile: MyProfile | null
  /** The next thing happening, or the one happening right now. */
  readonly hero: EventRow | null
  /** Everything after the hero, for "què més ve". */
  readonly rest: readonly EventRow[]
  readonly previous: EventRow | null
  readonly attendances: readonly AttendanceRow[]
  readonly me: RankingRow | null
  readonly total: number
  readonly schools: readonly SchoolRow[]
  readonly period: Period | null
  readonly isPending: boolean
  readonly isError: boolean
  readonly error: Error | null
  readonly refetch: () => void
}

const NOTHING: readonly EventRow[] = []

export function useHome(): Home {
  const userId = useUserId()
  const horizon = horizonIso()

  const profile = useQuery({
    queryKey: profileKeys.me(userId),
    queryFn: () => fetchProfile(userId),
  })
  const upcoming = useQuery({
    queryKey: homeKeys.upcoming(horizon),
    queryFn: () => fetchUpcoming(horizon),
  })
  const previous = useQuery({
    queryKey: homeKeys.previous(horizon),
    queryFn: () => fetchPrevious(horizon),
  })

  // Everything on screen at once, so places-left is right for the list rows
  // too and not just the hero.
  const eventIds = [...(upcoming.data ?? NOTHING), ...(previous.data ?? NOTHING)].map((e) => e.id)
  const attendances = useQuery({
    queryKey: homeKeys.attendances(eventIds),
    queryFn: () => fetchAttendances(eventIds),
    enabled: upcoming.isSuccess && previous.isSuccess,
  })

  // The teaser strip shows the standing over the whole course, which is the
  // first period row. Same query key as the ranking screen's default, so
  // opening that tab is instant and costs nothing.
  const periods = usePeriods()
  const period = defaultPeriod(periods.data)
  const bounds = periodBounds(period)
  const ranking = useQuery({
    queryKey: rankingKeys.individual(bounds),
    queryFn: () => fetchRanking(bounds),
    enabled: periods.isSuccess,
  })
  const schools = useQuery({
    queryKey: rankingKeys.schools(bounds),
    queryFn: () => fetchSchools(bounds),
    enabled: periods.isSuccess,
  })

  const events = upcoming.data ?? NOTHING

  return {
    profile: profile.data ?? null,
    hero: events[0] ?? null,
    rest: events.slice(1),
    previous: previous.data?.[0] ?? null,
    attendances: attendances.data ?? [],
    me: ranking.data?.find((r) => r.user_id === userId) ?? null,
    total: ranking.data?.length ?? 0,
    schools: schools.data ?? [],
    period,
    // The events are the screen. The ranking strip and the answer counts fill
    // in behind them rather than holding the whole page on a spinner.
    isPending: upcoming.isPending || previous.isPending,
    isError: upcoming.isError || previous.isError,
    error: upcoming.error ?? previous.error,
    refetch: () => {
      void upcoming.refetch()
      void previous.refetch()
    },
  }
}

/**
 * Saying yes from the home screen.
 *
 * An upsert, because the row may not exist yet or may say 'potser'. RLS allows
 * exactly si/potser/no here and nothing else, so there is no way for this path
 * to mark somebody as having attended.
 */
export function useAnswer() {
  const userId = useUserId()
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ eventId, estado }: { eventId: string; estado: Answer }) =>
      setAnswer(userId, eventId, estado),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['home', 'attendances'] })
    },
  })
}
