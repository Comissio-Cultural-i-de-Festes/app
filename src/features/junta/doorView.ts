import type { EventRow } from '@/lib/schema'

import { JUNTA_BACK_MS } from './eventsApi'
import type { DoorNow, JuntaHomeData } from './homeApi'

/**
 * Què pinta la porta del rebedor, i de quan són les dades.
 *
 * LES DADES VAN ABANS QUE L'ERROR. React Query es queda les dades d'abans
 * quan una recàrrega falla, i la pantalla mirava `isError` primer: en tornar a
 * l'app amb la xarxa saturada —que és exactament quan s'obre, a la porta— la
 * recàrrega en segon pla fallava i la porta que ja hi era desapareixia darrere
 * d'un «no s'ha pogut llegir», amb el botó de l'escàner a dins. Una porta de
 * fa deu minuts és la mateixa porta: l'esdeveniment no ha canviat, només els
 * números. Per això es pinta igual, amb una línia que diu de quan és.
 *
 * Sense dades sí que és un error, i llavors el camí a l'escàner es busca a la
 * llista d'esdeveniments, que és una altra consulta i pot haver arribat. Si
 * tampoc no hi és, no es pinta cap botó: abans n'hi havia un que portava a
 * aquesta mateixa pantalla, i un botó que no fa res a una porta amb cua és
 * pitjor que cap.
 */

export interface HomeQuery {
  readonly data: JuntaHomeData | undefined
  readonly isError: boolean
  readonly fetchStatus: 'fetching' | 'paused' | 'idle'
  readonly dataUpdatedAt: number
}

export type DoorEvent = Pick<EventRow, 'id' | 'starts_at' | 'published'>

export type DoorView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly scannerEventId: string | null }
  /** `staleSince`: l'hora de les dades quan l'última recàrrega no ha arribat, o null. */
  | { readonly kind: 'none'; readonly staleSince: number | null }
  | { readonly kind: 'door'; readonly porta: DoorNow; readonly staleSince: number | null }

/** Les trenta hores endavant de `junta_home()`, migració 69. Les vuit enrere són `JUNTA_BACK_MS`. */
const AHEAD_MS = 30 * 3_600_000

export function doorView(
  home: HomeQuery,
  events: readonly DoorEvent[] | undefined,
  now: number = Date.now(),
): DoorView {
  if (home.data === undefined) {
    // Sense xarxa la primera consulta es queda en pausa, no falla, i la
    // pantalla de càrrega duraria fins que tornés la cobertura.
    if (home.isError || home.fetchStatus === 'paused') {
      return { kind: 'failed', scannerEventId: doorEventId(events, now) }
    }
    return { kind: 'loading' }
  }

  // «Paused» també compta: volia recarregar i no ha pogut, i el que es veu és
  // tan vell com si hagués fallat. «Fetching» no: encara pot arribar.
  const stale = home.isError || home.fetchStatus === 'paused'
  const staleSince = stale ? home.dataUpdatedAt : null
  const { porta } = home.data
  return porta === null ? { kind: 'none', staleSince } : { kind: 'door', porta, staleSince }
}

/**
 * L'esdeveniment que `junta_home()` posaria a la porta, tret de la llista.
 *
 * La mateixa regla —publicat, de vuit hores enrere a trenta endavant, el
 * primer— perquè sense la porta això és l'única pista. La llista ja arriba
 * ordenada i sense reunions.
 */
function doorEventId(events: readonly DoorEvent[] | undefined, now: number): string | null {
  const open = events?.find((e) => {
    const at = Date.parse(e.starts_at)
    return e.published && at >= now - JUNTA_BACK_MS && at <= now + AHEAD_MS
  })
  return open?.id ?? null
}

export function minutesAgo(since: number, now: number): number {
  return Math.max(0, Math.floor((now - since) / 60_000))
}
