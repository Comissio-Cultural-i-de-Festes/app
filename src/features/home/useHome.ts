import {
  type QueryClient,
  type QueryKey,
  keepPreviousData,
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

import { restoreEvent, withMyAnswer } from './answer'
import {
  type EventRow,
  fetchPrevious,
  fetchSummaries,
  fetchUpcoming,
  homeKeys,
  horizonIso,
  setAnswer,
} from './api'
import type { EventSummary } from './summary'

export interface Home {
  readonly profile: MyProfile | null
  /** The next thing happening, or the one happening right now. */
  readonly hero: EventRow | null
  /** Everything after the hero, for "què més ve". */
  readonly rest: readonly EventRow[]
  readonly previous: EventRow | null
  /** Un per esdeveniment de la pantalla: quants hi van, les cares, la meva resposta. */
  readonly summaries: readonly EventSummary[]
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
  /** Les assistències encara poden arribar: el botó espera i no s'avança. */
  readonly answersLoading: boolean
  /** No arribaran sense que passi alguna cosa: el botó no sap què dir. */
  readonly answersUnavailable: boolean
  readonly retryAnswers: () => void
  /** El rànquing encara pot arribar: el bloc reserva el seu lloc. */
  readonly rankingLoading: boolean
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
  const summaries = useQuery({
    queryKey: homeKeys.summaries(eventIds),
    queryFn: () => fetchSummaries(eventIds),
    enabled: upcoming.isSuccess && previous.isSuccess,
    // Un esdeveniment nou al calendari canvia la clau; sense això les
    // assistències tornaven a ser un forat i el botó, un esquelet, a mig mirar-lo.
    placeholderData: keepPreviousData,
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

  // Cadascuna amb el seu rellotge: que les assistències o el rànquing no
  // arribin no pot tenir el botó o el bloc en espera per sempre, i tampoc no
  // és un error de tota la pantalla.
  const answers = useAvailability(summaries)
  const standing = useAvailability([periods, ranking, schools])

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
    summaries: summaries.data ?? [],
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
    answersLoading: answers.loading,
    answersUnavailable: answers.unavailable,
    retryAnswers: answers.retry,
    rankingLoading: standing.loading,
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
 * OPTIMISTA, I EL SERVIDOR TÉ L'ÚLTIMA PARAULA. En prémer, el resum de
 * l'esdeveniment ja diu el que s'espera (`expected`) —la meva resposta, el
 * recompte i la meva cara— i el botó canvia a l'instant: abans tornava a
 * «M'hi apunto» el temps d'una recàrrega, i amb 4G lent la gent el tornava a
 * prémer. En acabar, diu el que ha tornat la crida —llista d'espera,
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

/** El resum d'abans de l'esdeveniment, per consulta; només aquest, que és el que es desfà. */
type Snapshot = readonly {
  readonly key: QueryKey
  readonly previous: EventSummary | undefined
}[]

const SUMMARIES: QueryKey = ['home', 'summaries']

function concerning(client: QueryClient, eventId: string) {
  return client
    .getQueryCache()
    .findAll({ queryKey: SUMMARIES })
    .filter((q) => q.queryKey.slice(2).includes(eventId))
}

export function useAnswer() {
  const client = useQueryClient()
  const userId = useUserId()

  const show = (eventId: string, estado: AttendanceState) => {
    const avatar = client.getQueryData<MyProfile>(profileKeys.of(userId))?.avatar_url ?? null
    for (const q of concerning(client, eventId)) {
      client.setQueryData<EventSummary[]>(q.queryKey, (summaries) =>
        summaries === undefined
          ? summaries
          : withMyAnswer(summaries, eventId, userId, estado, new Date(), avatar),
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
      await client.cancelQueries({ queryKey: SUMMARIES })
      const before = concerning(client, eventId).map((q) => ({
        key: q.queryKey,
        previous: client
          .getQueryData<EventSummary[]>(q.queryKey)
          ?.find((s) => s.event_id === eventId),
      }))
      show(eventId, expected ?? estado)
      return { before }
    },
    onError: (_err, { eventId }, context) => {
      for (const { key, previous } of context?.before ?? []) {
        client.setQueryData<EventSummary[]>(key, (summaries) =>
          summaries === undefined ? summaries : restoreEvent(summaries, eventId, previous),
        )
      }
    },
    onSuccess: (result, { eventId }) => {
      show(eventId, result.estado)
    },
    onSettled: (_data, _err, { eventId }) => {
      void client.invalidateQueries({ queryKey: SUMMARIES })
      void client.invalidateQueries({ queryKey: eventKeys.waitlist(eventId) })
    },
  })
}
