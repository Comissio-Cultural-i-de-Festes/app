import { zonedDayStart } from '@/i18n/format'
import type { AttendanceState } from '@/lib/model'

/**
 * El que l'Inici i la fitxa saben de les assistències d'un esdeveniment.
 *
 * Abans eren les files d'`attendances`, totes, amb el perfil de cadascú
 * incrustat, i la pantalla en treia un número, tres cares i la resposta
 * pròpia. Ara `resum_assistencies()` ho compta al servidor, amb la RLS de qui
 * pregunta —és `security invoker`—, i en baixa una fila per esdeveniment.
 *
 * El tall de «avui» es queda aquí. La zona de l'associació és configuració del
 * client, i el servidor dona els noms de les últimes 26 hores, que cobreixen
 * qualsevol «avui»; on comença el dia ho decideix `zonedDayStart`, com abans.
 */

export interface Face {
  readonly user_id: string
  readonly avatar_url: string | null
  readonly created_at: string
}

export interface Recent {
  readonly nombre: string
  readonly created_at: string
}

export interface EventSummary {
  readonly event_id: string
  /** Sí i fitxats: el número de «hi van» i el que es resta de les places. */
  readonly going: number
  /** Només els fitxats. */
  readonly attended: number
  readonly mine: AttendanceState | null
  /** Quan vaig contestar el primer cop: és on el servidor posa la meva cara. */
  readonly mine_at: string | null
  /** Les cinc últimes persones que hi van, de la més nova a la més vella. */
  readonly faces: readonly Face[]
  /** Qui hi va i ha contestat les últimes 26 hores, sense mi. */
  readonly recent: readonly Recent[]
}

/** Quantes cares torna el servidor: les que pinta la fitxa. */
export const FACES = 5

export function emptySummary(eventId: string): EventSummary {
  return {
    event_id: eventId,
    going: 0,
    attended: 0,
    mine: null,
    mine_at: null,
    faces: [],
    recent: [],
  }
}

/**
 * El d'un esdeveniment, o un de buit.
 *
 * El servidor en torna un per cada id que se li demana, també quan no hi ha
 * ningú; el buit és per a les dades que encara no han arribat, que la
 * pantalla ja tracta a part amb el seu esquelet.
 */
export function summaryOf(summaries: readonly EventSummary[], eventId: string): EventSummary {
  return summaries.find((s) => s.event_id === eventId) ?? emptySummary(eventId)
}

/** Hi compta: ha dit que sí o ja ha passat per la porta. */
export function isGoing(estado: AttendanceState | null): boolean {
  return estado === 'si' || estado === 'asistio'
}

/**
 * The names behind "en Marc, la Júlia i 3 més s'han apuntat avui".
 *
 * Yours never arrives — the server leaves it out, because you know you signed
 * up and the line exists to show movement by other people.
 *
 * "Today" is the same calendar day in the association's zone, compared day
 * index to day index. Comparing against a midnight computed as an instant is
 * the version that quietly loses everything signed up between midnight and two
 * in the morning, which at this association is not an edge case.
 */
export function signedUpToday(summary: EventSummary, now: Date): string[] {
  const today = zonedDayStart(now)
  return summary.recent
    .filter((r) => zonedDayStart(new Date(r.created_at)) === today)
    .map((r) => r.nombre)
}
