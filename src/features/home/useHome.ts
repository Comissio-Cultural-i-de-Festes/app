import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  type Period,
  type RankingRow,
  type SchoolRow,
  periodBounds,
  rankingKeys,
} from '@/features/ranking/api'
import { viatgerKeys } from '@/features/event/viatgerApi'
import { defaultPeriod, usePeriods } from '@/features/ranking/useRanking'
import { fetchRanking, fetchSchools } from '@/features/ranking/api'
import { type MyProfile, fetchProfile, profileKeys } from '@/features/session/profile'
import { useUserId } from '@/features/session/useUserId'
import type { Answer } from '@/lib/model'
import { useAvailability } from '@/lib/useAvailability'

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
  /** Encara pot arribar: esquelet. */
  readonly isPending: boolean
  /** Fallat, sense xarxa o sense resposta: missatge i reintentar. */
  readonly isError: boolean
  readonly messageKey: string
  readonly refetch: () => void
}

const NOTHING: readonly EventRow[] = []

export function useHome(): Home {
  const userId = useUserId()
  const horizon = horizonIso()

  const profile = useQuery({
    queryKey: profileKeys.of(userId),
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
  const view = useAvailability([upcoming, previous])

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

  // Una reunió no competeix amb una festa pel hero. El hero és la decisió de
  // la nit —hi vaig o no— i una reunió de tres persones un dimarts a les 18:30
  // hi ocuparia el lloc de la festa del divendres. Va a «Què més ve», que és
  // on el disseny la posa, amb el seu xip i sense la portada.
  //
  // Si NOMÉS hi ha reunions, la primera sí que és el hero: val més el que ve
  // que la pantalla buida de «res, de moment».
  const hero = events.find((e) => e.tipo !== 'reunio') ?? events[0] ?? null

  return {
    profile: profile.data ?? null,
    hero,
    rest: events.filter((e) => e.id !== hero?.id),
    previous: previous.data?.[0] ?? null,
    attendances: attendances.data ?? [],
    me: ranking.data?.find((r) => r.user_id === userId) ?? null,
    total: ranking.data?.length ?? 0,
    schools: schools.data ?? [],
    period,
    // The events are the screen. The ranking strip and the answer counts fill
    // in behind them rather than holding the whole page on a spinner.
    //
    // Through `useAvailability` and not `isPending`/`isError`: offline the two
    // queries pause rather than fail, and the hero skeleton stayed up for as
    // long as there was no signal.
    isPending: view.loading,
    isError: view.unavailable,
    messageKey: view.messageKey,
    refetch: view.retry,
  }
}

/**
 * Saying yes from the home screen.
 *
 * Through set_attendance(), because the row may not exist yet or may say
 * 'potser' and PostgREST's own upsert cannot express that with the privileges
 * the client has. RLS allows exactly si/potser/no, so there is no way for this
 * path to mark somebody as having attended.
 */
export function useAnswer() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ eventId, estado }: { eventId: string; estado: Answer }) =>
      setAnswer(eventId, estado),
    onSuccess: (_, { eventId }) => {
      void client.invalidateQueries({ queryKey: ['home', 'attendances'] })
      // Un «no» esborra les dades de viatger a la base (migració 90), i el
      // bloc de la fitxa diria que hi són fins que caduqués la cau.
      void client.invalidateQueries({ queryKey: viatgerKeys.totes(eventId) })
    },
  })
}
