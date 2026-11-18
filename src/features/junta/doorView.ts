import { STALE_TIME_MS } from '@/lib/queryClient'
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

/**
 * De quan són les dades que es veuen, quan no són d'ara.
 *
 * `failed`: la recàrrega ha fallat o espera la xarxa, i no arribarà sola.
 * Si no, n'hi ha una en marxa que encara pot arribar.
 */
export interface Stale {
  readonly since: number
  readonly failed: boolean
}

export type DoorView =
  /** `scannerEventId`: el camí a l'escàner que ja se sap sense la porta, o null. */
  | { readonly kind: 'loading'; readonly scannerEventId: string | null }
  | { readonly kind: 'failed'; readonly scannerEventId: string | null }
  | { readonly kind: 'none'; readonly stale: Stale | null }
  | { readonly kind: 'door'; readonly porta: DoorNow; readonly stale: Stale | null }

/** Les trenta hores endavant de `junta_home()`, migració 69. Les vuit enrere són `JUNTA_BACK_MS`. */
const AHEAD_MS = 30 * 3_600_000

export function doorView(
  home: HomeQuery,
  events: readonly DoorEvent[] | undefined,
  now: number = Date.now(),
): DoorView {
  if (home.data === undefined) {
    const scannerEventId = doorEventId(events, now)
    // Sense xarxa la primera consulta es queda en pausa, no falla, i la
    // pantalla de càrrega duraria fins que tornés la cobertura.
    if (home.isError || home.fetchStatus === 'paused') return { kind: 'failed', scannerEventId }
    // Mentre carrega també: en fred i amb la xarxa saturada, la primera
    // consulta pot trigar minuts, i si la llista ja sap l'esdeveniment no hi
    // ha cap motiu per fer esperar l'escàner.
    return { kind: 'loading', scannerEventId }
  }

  const { porta } = home.data
  const stale = staleness(home, now)
  return porta === null ? { kind: 'none', stale } : { kind: 'door', porta, stale }
}

/**
 * Si el que es veu és vell, i per què.
 *
 * «Paused» compta com a fallada: volia recarregar i no ha pogut, i el que es
 * veu és tan vell com si hagués fallat.
 *
 * «Fetching» compta si les dades passen del minut de `staleTime`. Una
 * recàrrega penjada no falla mai —no hi ha cap temps màxim per a aquesta
 * consulta—, i mirant només els errors la porta ensenyava números de fa
 * quaranta minuts sense dir res. Amb dades de menys d'un minut, una recàrrega
 * en marxa és la normal i no se'n diu res.
 */
function staleness(home: HomeQuery, now: number): Stale | null {
  if (home.isError || home.fetchStatus === 'paused') {
    return { since: home.dataUpdatedAt, failed: true }
  }
  if (home.fetchStatus === 'fetching' && now - home.dataUpdatedAt > STALE_TIME_MS) {
    return { since: home.dataUpdatedAt, failed: false }
  }
  return null
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
