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
 * On comença «avui» ho decideix el client, perquè la zona de l'associació és
 * configuració seva (`VITE_TIME_ZONE`): la consulta porta l'instant
 * (`dayStartIso`) i el servidor compta d'aquí endavant.
 */

export interface Face {
  readonly user_id: string
  readonly avatar_url: string | null
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
  /** Quanta gent hi va i ha contestat avui, sense mi. */
  readonly recent_total: number
  /** Els dos noms més nous d'aquests. */
  readonly recent: readonly string[]
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
    recent_total: 0,
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

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const dayStarts = new Map<number, string>()

/**
 * L'instant en què ha començat avui a la zona de l'associació, en ISO.
 *
 * És el `p_desde` de «s'hi han apuntat avui». Comptar des d'una mitjanit
 * calculada en UTC és la versió que perd en silenci tothom qui s'apunta entre
 * les dotze i les dues de la nit, que en aquesta associació no és un cas rar.
 *
 * Es busca el primer minut del dia amb `zonedDayStart`, que ja sap la zona i
 * els canvis d'hora, en lloc de restar un desplaçament: el dia del canvi
 * d'hora, el desplaçament d'ara no és el de la mitjanit. La mitjanit local cau
 * sempre entre catorze hores abans i dotze després de la mitjanit UTC del
 * mateix dia, i hi arriba en una dotzena de passos.
 *
 * El resultat és part de la clau de la consulta, i es desa per dia per no
 * tornar-lo a buscar a cada render.
 */
export function dayStartIso(now: Date): string {
  const day = zonedDayStart(now)
  const hit = dayStarts.get(day)
  if (hit !== undefined) return hit
  let lo = (day - 14 * HOUR_MS) / MINUTE_MS
  let hi = (day + 12 * HOUR_MS) / MINUTE_MS
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (zonedDayStart(new Date(mid * MINUTE_MS)) >= day) hi = mid
    else lo = mid + 1
  }
  const iso = new Date(lo * MINUTE_MS).toISOString()
  dayStarts.set(day, iso)
  return iso
}
