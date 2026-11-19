import {
  type QueryClient,
  type QueryKey,
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { eventKeys } from '@/features/event/api'

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
import type { Answer, AttendanceState } from '@/lib/model'
import { useAvailability } from '@/lib/useAvailability'

import { restoreMyRow, withMyAnswer } from './answer'
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
 * Saying yes, from any of the three places that has the button.
 *
 * Through set_attendance(), because the row may not exist yet or may say
 * 'potser' and PostgREST's own upsert cannot express that with the privileges
 * the client has. RLS allows exactly si/potser/no, so there is no way for this
 * path to mark somebody as having attended.
 *
 * OPTIMISTA, I EL SERVIDOR TÉ L'ÚLTIMA PARAULA. En prémer, la meva fila ja diu
 * el que s'espera (`expected`) i el botó canvia a l'instant: abans tornava a
 * «M'hi apunto» el temps d'una recàrrega, i amb 4G lent la gent el tornava a
 * prémer. En acabar, la fila diu el que ha tornat la crida —llista d'espera,
 * «sol·licitat»—, que pot no ser el que s'esperava, i la recàrrega només
 * confirma, sense fer esperar el botó. Si falla, tot torna a com estava.
 *
 * SENSE XARXA NO ÉS OPTIMISTA. La mutació queda en pausa i no ha sortit res:
 * dir «Ets dins» seria mentir. Es queda el botó ocupat amb la línia del
 * `AnswerNote`, que ja diu que s'enviarà sola quan torni la xarxa.
 */
export interface AnswerVars {
  readonly eventId: string
  readonly estado: Answer
  /** El que es mostra mentre no hi ha resposta; per defecte, el demanat. */
  readonly expected?: AttendanceState
}

/** La meva fila d'abans, per consulta; només la meva, que és el que es desfà. */
type Snapshot = readonly { readonly key: QueryKey; readonly mine: AttendanceRow | null }[]

const ATTENDANCES: QueryKey = ['home', 'attendances']

function concerning(client: QueryClient, eventId: string) {
  return client
    .getQueryCache()
    .findAll({ queryKey: ATTENDANCES })
    .filter((q) => q.queryKey.slice(2).includes(eventId))
}

export function useAnswer() {
  const client = useQueryClient()
  const userId = useUserId()

  const show = (eventId: string, estado: AttendanceState) => {
    const me = client.getQueryData<MyProfile>(profileKeys.of(userId))
    const profile = me === undefined ? null : { nombre: me.nombre, avatar_url: me.avatar_url }
    for (const q of concerning(client, eventId)) {
      client.setQueryData<AttendanceRow[]>(q.queryKey, (rows) =>
        rows === undefined
          ? rows
          : withMyAnswer(rows, eventId, userId, estado, new Date(), profile),
      )
    }
  }

  return useMutation({
    // Una a una, de totes les pantalles: una resposta vella que arribés
    // després d'una de nova la sobreescriuria al servidor. Una sola cua i no
    // una per esdeveniment perquè `scope` és estàtic i la clau depèn de la
    // crida; dir «sí» a dos esdeveniments alhora no és un cas que valgui més.
    scope: { id: 'answer' },
    mutationFn: ({ eventId, estado }: AnswerVars) => setAnswer(eventId, estado),
    onMutate: async ({ eventId, estado, expected }): Promise<{ readonly before: Snapshot }> => {
      if (!onlineManager.isOnline()) return { before: [] }
      // Una recàrrega que ja volava portaria l'estat d'abans i el pintaria a
      // sobre del que acabem de posar.
      await client.cancelQueries({ queryKey: ATTENDANCES })
      const before = concerning(client, eventId).map((q) => ({
        key: q.queryKey,
        mine:
          client
            .getQueryData<AttendanceRow[]>(q.queryKey)
            ?.find((r) => r.event_id === eventId && r.user_id === userId) ?? null,
      }))
      show(eventId, expected ?? estado)
      return { before }
    },
    onError: (_err, { eventId }, context) => {
      for (const { key, mine } of context?.before ?? []) {
        client.setQueryData<AttendanceRow[]>(key, (rows) =>
          rows === undefined ? rows : restoreMyRow(rows, eventId, userId, mine),
        )
      }
    },
    onSuccess: (result, { eventId }) => {
      show(eventId, result.estado)
    },
    onSettled: (_data, _err, { eventId }) => {
      void client.invalidateQueries({ queryKey: ATTENDANCES })
      void client.invalidateQueries({ queryKey: eventKeys.waitlist(eventId) })
    },
  })
}
