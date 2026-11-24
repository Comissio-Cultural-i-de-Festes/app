import { endOfEvent } from '@/lib/eventEnd'

/**
 * En quin moment és una activitat: encara ha de venir, és en curs o ja s'ha
 * acabat.
 *
 * La fitxa en coneixia dos. `starts_at < ara` en feia «Ja ha passat», i per a
 * una festa de cinc hores l'error era petit; per a una casa rural de
 * divendres a diumenge, la fitxa ho deia a tothom que encara hi era dins
 * durant dos dies. El final és el de `eventEnd`, el mateix que fa servir el
 * punt de «Qui hi ha ara dins», de manera que les dues coses de la pantalla
 * s'apaguen al mateix instant.
 */

export type EventPhase = 'upcoming' | 'live' | 'over'

export function eventPhase(startsAt: string, endsAt: string | null, now: number): EventPhase {
  if (now < new Date(startsAt).getTime()) return 'upcoming'
  return now < endOfEvent(startsAt, endsAt) ? 'live' : 'over'
}
