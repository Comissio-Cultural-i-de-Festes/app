import type { QueryClient } from '@tanstack/react-query'

import { doorKeys } from '@/features/door/api'
import {
  type EventRow,
  fetchAttendances,
  fetchPrevious,
  fetchUpcoming,
  homeKeys,
  horizonIso,
} from '@/features/home/api'
import { avisosKeys, fetchAvisComptes } from '@/features/junta/avisosApi'
import { fetchPointValues } from '@/features/junta/eventFormApi'
import { fetchJuntaEvents, juntaEventKeys, juntaHorizonIso } from '@/features/junta/eventsApi'
import { fetchJuntaHome, juntaHomeKeys } from '@/features/junta/homeApi'
import { fetchHoresPendents, horesKeys } from '@/features/junta/horesApi'
import { fetchMeetings, meetingListKeys } from '@/features/junta/meetingsApi'
import { fetchAllMembers, memberKeys } from '@/features/junta/membersApi'
import { fetchPendentsEsperen, pendentsKeys } from '@/features/junta/pendentsApi'
import { fetchNights, photoKeys } from '@/features/photos/api'
import { fetchStreak, profileScreenKeys } from '@/features/profile/api'
import {
  type Period,
  cursPeriod,
  fetchPeriods,
  fetchRanking,
  fetchSchools,
  periodBounds,
  rankingKeys,
} from '@/features/ranking/api'

/**
 * L'arrencada en dues voltes de xarxa i no en quatre.
 *
 * Cada pantalla demanava les seves dades en muntar-se, i es muntava quan la
 * porta havia rebut el perfil: perfil, després les consultes, després les que
 * en pengen, i encara alguna targeta que es munta tard. Amb 150 ms d'anada i
 * tornada cada volta és mig segon abans de comptar el que baixa. Aquí es
 * llança tot el que no depèn de res a la vegada que el perfil, i el que
 * depèn d'una resposta —les assistències d'uns esdeveniments, el rànquing
 * d'un període— surt quan aquesta resposta arriba, sense esperar que React
 * munti res.
 *
 * LES MATEIXES CLAUS QUE LES PANTALLES, de les mateixes fàbriques i amb les
 * mateixes funcions: la pantalla que es munta després troba la dada a la cau
 * i no demana res. Si una clau canvia, `startPrefetch.test.tsx` falla; no hi
 * ha una segona llista de claus per mantenir.
 *
 * `prefetchQuery` no llança mai: un error aquí deixa la consulta sense dades i
 * la pantalla la demana ella, amb el seu estat d'error i el seu «torna-ho a
 * provar». I amb la xarxa caiguda queda en pausa com qualsevol altra.
 */

/** Les consultes de l'Inici d'un soci actiu. */
export async function prefetchHome(client: QueryClient, userId: string): Promise<void> {
  const horizon = horizonIso()

  await Promise.all([
    client.prefetchQuery({
      queryKey: homeKeys.upcoming(horizon),
      queryFn: () => fetchUpcoming(horizon),
    }),
    client.prefetchQuery({
      queryKey: homeKeys.previous(horizon),
      queryFn: () => fetchPrevious(horizon),
    }),
    client.prefetchQuery({ queryKey: rankingKeys.periods(), queryFn: fetchPeriods }),
    // La targeta de la ratxa no penja de res, però es munta de les últimes i
    // la seva petició sortia a la volta quatre.
    client.prefetchQuery({
      queryKey: profileScreenKeys.streak(userId),
      queryFn: fetchStreak,
    }),
  ])

  const upcoming = client.getQueryData<EventRow[]>(homeKeys.upcoming(horizon))
  const previous = client.getQueryData<EventRow[]>(homeKeys.previous(horizon))
  const periods = client.getQueryData<Period[]>(rankingKeys.periods())

  const second: Promise<void>[] = []
  // Les nits, com `useExitOffer`: només si hi ha un esdeveniment anterior.
  if (previous?.[0] !== undefined) {
    second.push(client.prefetchQuery({ queryKey: photoKeys.nights(), queryFn: fetchNights }))
  }
  if (upcoming !== undefined && previous !== undefined) {
    // L'ordre és el de `useHome`: la clau porta els ids tal qual.
    const ids = [...upcoming, ...previous].map((e) => e.id)
    if (ids.length > 0) {
      second.push(
        client.prefetchQuery({
          queryKey: homeKeys.attendances(ids),
          queryFn: () => fetchAttendances(ids),
        }),
      )
    }
  }
  if (periods !== undefined) {
    // La primera fila per `ordre`, com `defaultPeriod`: és la pestanya que
    // l'Inici ensenya.
    const bounds = periodBounds(periods[0] ?? null)
    second.push(
      client.prefetchQuery({
        queryKey: rankingKeys.individual(bounds),
        queryFn: () => fetchRanking(bounds),
      }),
      client.prefetchQuery({
        queryKey: rankingKeys.schools(bounds),
        queryFn: () => fetchSchools(bounds),
      }),
    )
  }
  await Promise.all(second)
}

/**
 * Les consultes de l'entrada a la junta. Només per a qui ho és: a un soci la
 * RLS li torna buit o 42501, i seria una petició per sentir «no».
 */
export async function prefetchJunta(client: QueryClient): Promise<void> {
  const horizon = juntaHorizonIso()
  await Promise.all([
    client.prefetchQuery({ queryKey: juntaHomeKeys.home(), queryFn: fetchJuntaHome }),
    client.prefetchQuery({
      queryKey: juntaEventKeys.list(horizon),
      queryFn: () => fetchJuntaEvents(horizon),
    }),
    client.prefetchQuery({ queryKey: rankingKeys.periods(), queryFn: fetchPeriods }),
    client.prefetchQuery({ queryKey: horesKeys.pendents(), queryFn: fetchHoresPendents }),
    client.prefetchQuery({ queryKey: pendentsKeys.esperen(), queryFn: fetchPendentsEsperen }),
    client.prefetchQuery({ queryKey: doorKeys.pointValues(), queryFn: fetchPointValues }),
    client.prefetchQuery({ queryKey: memberKeys.list(), queryFn: fetchAllMembers }),
    client.prefetchQuery({ queryKey: meetingListKeys.list(), queryFn: fetchMeetings }),
  ])

  // El comptador d'avisos depèn de la finestra del curs, que surt dels períodes.
  const periods = client.getQueryData<Period[]>(rankingKeys.periods())
  if (periods === undefined) return
  const desDe = periodBounds(cursPeriod(periods)).from
  await client.prefetchQuery({
    queryKey: avisosKeys.comptes(desDe),
    queryFn: () => fetchAvisComptes(desDe),
  })
}
